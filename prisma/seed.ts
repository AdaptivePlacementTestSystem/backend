import { PrismaClient, UserRole, SessionStatus, StoppingReason, CEFRLevel, CEFRConfidence, Skill, ItemStatus, ItemBatchSource, ItemBatchStatus, AuthProviderType } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

/**
 * Băm mật khẩu bằng argon2 (#62). Mật khẩu CHỈ lấy từ biến môi trường, không hardcode.
 * Lưu ý: package.json hiện CHƯA có `argon2`; nếu thiếu thì seed dừng với thông báo rõ ràng.
 */
async function hashFromEnv(envName: string, required: boolean): Promise<string | null> {
  const plain = process.env[envName];
  if (!plain) {
    if (required) throw new Error(`Thiếu biến môi trường ${envName} (mật khẩu seed, không hardcode).`);
    return null;
  }
  const moduleName = 'argon2'; // import động để tsc không lỗi khi chưa cài
  let argon2: { hash: (p: string) => Promise<string> };
  try {
    argon2 = await import(moduleName);
  } catch {
    throw new Error('Chưa cài package `argon2` (xem #62). Cài trước khi seed.');
  }
  return argon2.hash(plain);
}

async function main() {
  console.log('🌱 Bắt đầu seed dữ liệu Placement Test (hệ thống đơn trường, toàn bộ dữ liệu giả)...');

  // 1. Users (Admin đầu tiên, GV thường, SV giả). Mật khẩu lấy từ env:
  //    SEED_ADMIN_PASSWORD (bắt buộc), SEED_TEACHER_PASSWORD, SEED_STUDENT_PASSWORD (tùy chọn).
  //    Thiếu mật khẩu tùy chọn => tài khoản không có thông tin đăng nhập (authProvider = null).
  const adminHash = await hashFromEnv('SEED_ADMIN_PASSWORD', true);
  const teacherHash = await hashFromEnv('SEED_TEACHER_PASSWORD', false);
  const studentHash = await hashFromEnv('SEED_STUDENT_PASSWORD', false);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.test' },
    update: {},
    create: {
      id: randomUUID(),
      email: 'admin@example.test',
      fullName: 'Quản trị viên (dữ liệu giả)',
      role: UserRole.ADMIN,
      authProvider: AuthProviderType.LOCAL,
      passwordHash: adminHash,
      mustChangePassword: true,
    },
  });

  const teacher = await prisma.user.upsert({
    where: { email: 'teacher.demo@example.test' },
    update: {},
    create: {
      id: randomUUID(),
      email: 'teacher.demo@example.test',
      fullName: 'Giảng viên mẫu (dữ liệu giả)',
      role: UserRole.TEACHER,
      authProvider: teacherHash ? AuthProviderType.LOCAL : null,
      passwordHash: teacherHash,
      mustChangePassword: teacherHash !== null,
      teacherProfile: { create: { teacherCode: 'GV-DEMO-001' } },
    },
  });

  const fakeStudents = [
    { email: 'student1@example.test', fullName: 'Sinh viên Giả Một', code: 'SV-DEMO-001' },
    { email: 'student2@example.test', fullName: 'Sinh viên Giả Hai', code: 'SV-DEMO-002' },
    { email: 'student3@example.test', fullName: 'Sinh viên Giả Ba', code: 'SV-DEMO-003' },
  ];
  const students = [];
  for (const st of fakeStudents) {
    students.push(
      await prisma.user.upsert({
        where: { email: st.email },
        update: {},
        create: {
          id: randomUUID(),
          email: st.email,
          fullName: st.fullName,
          role: UserRole.STUDENT,
          authProvider: studentHash ? AuthProviderType.LOCAL : null,
          passwordHash: studentHash,
          mustChangePassword: studentHash !== null,
          studentProfile: { create: { studentCode: st.code } },
        },
      }),
    );
  }
  const student1 = students[0];
  console.log(`✅ Users: 1 Admin, 1 Teacher, ${students.length} Students (giả)`);

  // 1b. Kỳ thi mẫu + danh sách thi giả (SV1, SV2; SV3 không thuộc kỳ để thử NOT_IN_ROUND)
  const now = Date.now();
  let examRound = await prisma.examRound.findFirst({
    where: { name: 'Kỳ thi xếp lớp mẫu (dữ liệu giả)' },
  });
  if (!examRound) {
    examRound = await prisma.examRound.create({
      data: {
        id: randomUUID(),
        name: 'Kỳ thi xếp lớp mẫu (dữ liệu giả)',
        createdById: admin.id,
        opensAt: new Date(now - 60 * 60 * 1000),
        closesAt: new Date(now + 24 * 60 * 60 * 1000),
        durationMinutes: 45,
        status: 'OPEN',
      },
    });
    await prisma.examRoundParticipant.createMany({
      data: [students[0], students[1]].map((s) => ({ roundId: examRound.id, studentId: s.id, note: 'Dữ liệu giả' })),
      skipDuplicates: true,
    });
  }
  console.log(`✅ ExamRound: ${examRound.name} (${examRound.id})`);

  // 2b. Lô seed (quyết định 16/10/2026): mọi câu phải thuộc một lô; lô seed có source = IMPORTED, status = DONE,
  //     created_by = Admin vừa tạo ở bước 1 (tạo Admin trước, rồi mới tạo lô). Dữ liệu giả này dùng một lô riêng;
  //     khi nạp bộ thật sẽ tạo thêm mỗi bộ một lô (CEFR-J, CLOTH, GV tự soạn) với `name` tương ứng.
  let seedBatch = await prisma.itemBatch.findFirst({
    where: { name: 'Dữ liệu giả để dev/test' },
  });
  if (!seedBatch) {
    seedBatch = await prisma.itemBatch.create({
      data: {
        id: randomUUID(),
        source: ItemBatchSource.IMPORTED,
        status: ItemBatchStatus.DONE,
        name: 'Dữ liệu giả để dev/test',
        createdById: admin.id,
      },
    });
  }

  // 3. Tạo 30 Items mẫu (15 Vocabulary, 15 Grammar) nếu chưa có
  const existingItemsCount = await prisma.item.count({ where: { batchId: seedBatch.id } });
  if (existingItemsCount === 0) {
  const itemsData: Array<{
    content: string;
    options: Record<string, string>;
    correctAnswer: string;
    skill: Skill;
    cefrTarget: CEFRLevel;
    irtB: number;
    status: ItemStatus;
    topicTag: string;
  }> = [];

  // 15 Vocabulary items
  const vocabDifficulties = [
    { b: -2.1, cefr: CEFRLevel.PRE_A1, word: 'book' },
    { b: -1.8, cefr: CEFRLevel.A1, word: 'apple' },
    { b: -1.4, cefr: CEFRLevel.A1, word: 'school' },
    { b: -0.9, cefr: CEFRLevel.A2, word: 'comfortable' },
    { b: -0.6, cefr: CEFRLevel.A2, word: 'appointment' },
    { b: -0.45, cefr: CEFRLevel.A2, word: 'opportunity' }, // V-102 trong tài liệu mẫu
    { b: -0.2, cefr: CEFRLevel.A2, word: 'environment' },
    { b: 0.05, cefr: CEFRLevel.B1, word: 'sustainable' },
    { b: 0.1, cefr: CEFRLevel.B1, word: 'perspective' },
    { b: 0.28, cefr: CEFRLevel.B1, word: 'comprehensive' }, // V-201
    { b: 0.5, cefr: CEFRLevel.B1, word: 'phenomenon' },
    { b: 0.9, cefr: CEFRLevel.B2, word: 'inevitable' },
    { b: 1.2, cefr: CEFRLevel.B2, word: 'meticulous' },
    { b: 1.6, cefr: CEFRLevel.C1_PLUS, word: 'ubiquitous' },
    { b: 2.1, cefr: CEFRLevel.C1_PLUS, word: 'ephemeral' },
  ];

  vocabDifficulties.forEach((v, index) => {
    itemsData.push({
      content: `What is the closest meaning of the word '${v.word}' in this context?`,
      options: {
        A: `Option A for ${v.word}`,
        B: `Correct meaning for ${v.word}`,
        C: `Option C for ${v.word}`,
        D: `Option D for ${v.word}`,
      },
      correctAnswer: 'B',
      skill: Skill.VOCABULARY,
      cefrTarget: v.cefr,
      irtB: v.b,
      status: index < 12 ? ItemStatus.FINAL_APPROVED : ItemStatus.DRAFT,
      topicTag: 'academic_vocabulary',
    });
  });

  // 15 Grammar items
  const grammarDifficulties = [
    { b: -2.0, cefr: CEFRLevel.PRE_A1, topic: 'to_be_present' },
    { b: -1.7, cefr: CEFRLevel.A1, topic: 'present_simple' },
    { b: -1.3, cefr: CEFRLevel.A1, topic: 'past_simple' },
    { b: -0.8, cefr: CEFRLevel.A2, topic: 'comparative' },
    { b: -0.5, cefr: CEFRLevel.A2, topic: 'present_perfect' },
    { b: -0.2, cefr: CEFRLevel.A2, topic: 'modal_verbs' }, // G-045
    { b: -0.05, cefr: CEFRLevel.B1, topic: 'passive_voice' }, // G-112
    { b: 0.15, cefr: CEFRLevel.B1, topic: 'first_conditional' },
    { b: 0.26, cefr: CEFRLevel.B1, topic: 'second_conditional' }, // G-198
    { b: 0.45, cefr: CEFRLevel.B1, topic: 'relative_clauses' },
    { b: 0.85, cefr: CEFRLevel.B2, topic: 'inversion' },
    { b: 1.15, cefr: CEFRLevel.B2, topic: 'mixed_conditionals' },
    { b: 1.55, cefr: CEFRLevel.C1_PLUS, topic: 'subjunctive_mood' },
    { b: 1.9, cefr: CEFRLevel.C1_PLUS, topic: 'cleft_sentences' },
    { b: 2.2, cefr: CEFRLevel.C1_PLUS, topic: 'participle_clauses' },
  ];

  grammarDifficulties.forEach((g, index) => {
    itemsData.push({
      content: `Choose the correct grammatical form to complete the sentence (${g.topic}).`,
      options: {
        A: `Grammar choice A (${g.topic})`,
        B: `Correct choice B (${g.topic})`,
        C: `Grammar choice C (${g.topic})`,
        D: `Grammar choice D (${g.topic})`,
      },
      correctAnswer: 'B',
      skill: Skill.GRAMMAR,
      cefrTarget: g.cefr,
      irtB: g.b,
      status: index < 12 ? ItemStatus.FINAL_APPROVED : ItemStatus.DRAFT,
      topicTag: g.topic,
    });
  });

  const createdItems = [];
  for (const item of itemsData) {
    const isApproved = item.status === ItemStatus.FINAL_APPROVED;
    const created = await prisma.item.create({
      data: {
        id: randomUUID(),
        content: item.content,
        options: item.options,
        correctAnswer: item.correctAnswer,
        skill: item.skill,
        cefrTarget: item.cefrTarget,
        irtB: item.irtB,
        irtA: 1.0,
        irtC: 0.25,
        status: item.status,
        batchId: seedBatch.id,
        topicTag: item.topicTag,
        approvedById: isApproved ? admin.id : null,
        approvedAt: isApproved ? new Date() : null,
        timesUsed: isApproved ? 1 : 0,
        calibrated: false,
      },
    });
    createdItems.push(created);
  }
  console.log(`✅ Items: ${createdItems.length} câu hỏi đã được tạo (24 FINAL_APPROVED, 6 DRAFT)`);

  // 4. Tạo 1 TestSession mẫu đã hoàn thành cho Student 1
  const sessionId = randomUUID();
  const testSession = await prisma.testSession.create({
    data: {
      id: sessionId,
      studentId: student1.id,
      examRoundId: examRound.id,
      status: SessionStatus.COMPLETED,
      thetaFinal: 0.33,
      seFinal: 0.34,
      stoppingReason: StoppingReason.SE_THRESHOLD,
      startedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 phút trước
      completedAt: new Date(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // min(startedAt + 45', closesAt)
    },
  });
  console.log(`✅ TestSession: ${testSession.id} hoàn thành với θ = 0.33, SE = 0.34`);

  // 5. Tạo 14 SessionResponses mẫu cho phiên thi (theo ví dụ Luong_Hoat_Dong_CATEngine.md)
  const approvedItems = createdItems.filter((i) => i.status === ItemStatus.FINAL_APPROVED);
  const sampleResponses = [
    { isCorrect: true, thetaAfter: -0.18, seAfter: 0.95 },
    { isCorrect: true, thetaAfter: 0.02, seAfter: 0.78 },
    { isCorrect: false, thetaAfter: -0.10, seAfter: 0.68 },
    { isCorrect: true, thetaAfter: 0.08, seAfter: 0.60 },
    { isCorrect: true, thetaAfter: 0.20, seAfter: 0.54 },
    { isCorrect: true, thetaAfter: 0.25, seAfter: 0.49 },
    { isCorrect: false, thetaAfter: 0.18, seAfter: 0.46 },
    { isCorrect: true, thetaAfter: 0.24, seAfter: 0.43 },
    { isCorrect: true, thetaAfter: 0.28, seAfter: 0.41 },
    { isCorrect: false, thetaAfter: 0.22, seAfter: 0.40 },
    { isCorrect: true, thetaAfter: 0.26, seAfter: 0.39 },
    { isCorrect: true, thetaAfter: 0.29, seAfter: 0.38 },
    { isCorrect: true, thetaAfter: 0.30, seAfter: 0.37 },
    { isCorrect: true, thetaAfter: 0.33, seAfter: 0.34 },
  ];

  for (let i = 0; i < sampleResponses.length; i++) {
    const item = approvedItems[i % approvedItems.length];
    const s = sampleResponses[i];

    await prisma.sessionResponse.create({
      data: {
        id: randomUUID(),
        sessionId: testSession.id,
        itemId: item.id,
        response: s.isCorrect ? 'B' : 'A',
        isCorrect: s.isCorrect,
        thetaAfter: s.thetaAfter,
        seAfter: s.seAfter,
        responseTimeMs: 15000 + i * 1000,
        answeredAt: new Date(Date.now() - (28 - i * 2) * 60 * 1000),
      },
    });
  }
  console.log(`✅ SessionResponses: 14 lượt trả lời đã ghi nhận`);

  // 6. Tạo LanguageProfile tương ứng với TestSession
  const languageProfile = await prisma.languageProfile.create({
    data: {
      id: randomUUID(),
      studentId: student1.id,
      testSessionId: testSession.id,
      completedAt: new Date(),
      theta: 0.33,
      standardError: 0.34,
      confidenceInterval95: [-0.3364, 0.9964],
      cefrLevel: CEFRLevel.B1,
      cefrConfidence: CEFRConfidence.MEDIUM,
      boundaryEffect: false,
      skillProfiles: [
        { skill: 'VOCABULARY', questionsCount: 7, correctCount: 5, scorePercent: 71 },
        { skill: 'GRAMMAR', questionsCount: 7, correctCount: 6, scorePercent: 86 },
      ],
      errorPatterns: [
        { topic: 'past_simple', severity: 'MEDIUM', count: 1 },
        { topic: 'sustainable_vocab', severity: 'LOW', count: 1 },
      ],
      testMetadata: {
        itemsAdministered: 14,
        algorithm: 'CAT-Rasch-1PL',
        thetaInit: -0.5,
        quadraturePoints: 41,
        stoppingReason: StoppingReason.SE_THRESHOLD,
      },
      aiRecommendations: [
        'Cần ôn tập thêm các từ vựng chủ đề môi trường và tính từ nâng cao.',
        'Chú ý thì quá khứ đơn trong các mệnh đề quan hệ.',
      ],
    },
  });
  console.log(`✅ LanguageProfile: ${languageProfile.id} cấp độ ${languageProfile.cefrLevel} (B1) đã tạo xong`);

  // 7. Tạo 1 Explanation mẫu cho câu hỏi đầu tiên
  await prisma.explanation.create({
    data: {
      id: randomUUID(),
      itemId: approvedItems[0].id,
      content: 'Đáp án B là chính xác vì từ vựng này mang nghĩa phù hợp nhất với ngữ cảnh học thuật được mô tả.',
    },
  });
  console.log(`✅ Explanation: Tạo lời giải thích mẫu cho Item 1`);
  } else {
    console.log(`ℹ️ Items: Lô "${seedBatch.name}" đã có ${existingItemsCount} câu hỏi, bỏ qua việc tạo lại.`);
  }

  console.log('\n🎉 Hoàn thành seed dữ liệu mẫu thành công!');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi seed dữ liệu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
