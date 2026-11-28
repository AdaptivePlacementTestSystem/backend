const { PrismaClient, UserRole, AuthProviderType, ItemStatus, ItemBatchSource, ItemBatchStatus, Skill, CEFRLevel } = require('@prisma/client');
const { createHash } = require('crypto');
const argon2 = require('argon2');

const prisma = new PrismaClient();

function sha256(str) {
  return createHash('sha256').update(str).digest('hex');
}

async function main() {
  console.log('🌱 Seeding realistic Teacher Review demo data...');

  const passwordHash = await argon2.hash('Password123@');

  // 1. Teacher A: Pham Tran Thien Dang
  const teacherA = await prisma.user.upsert({
    where: { email: 'phamtranthiendang308@gmail.com' },
    update: {
      passwordHash,
      role: UserRole.TEACHER,
      mustChangePassword: false,
      isActive: true,
      authProvider: AuthProviderType.LOCAL,
    },
    create: {
      email: 'phamtranthiendang308@gmail.com',
      fullName: 'Phạm Trần Thiện Đăng',
      role: UserRole.TEACHER,
      authProvider: AuthProviderType.LOCAL,
      passwordHash,
      mustChangePassword: false,
      isActive: true,
      teacherProfile: {
        create: {
          teacherCode: 'GV-DANG-001',
        },
      },
    },
  });
  console.log(`✅ Teacher A created/updated: ${teacherA.email} (${teacherA.id})`);

  // 2. Teacher B: TS. Tran Van Binh
  const teacherB = await prisma.user.upsert({
    where: { email: 'teacher.demo@example.test' },
    update: {
      passwordHash,
      role: UserRole.TEACHER,
      mustChangePassword: false,
      isActive: true,
      authProvider: AuthProviderType.LOCAL,
    },
    create: {
      email: 'teacher.demo@example.test',
      fullName: 'TS. Trần Văn Bình (Trưởng bộ môn)',
      role: UserRole.TEACHER,
      authProvider: AuthProviderType.LOCAL,
      passwordHash,
      mustChangePassword: false,
      isActive: true,
      teacherProfile: {
        create: {
          teacherCode: 'GV-BINH-002',
        },
      },
    },
  });
  console.log(`✅ Teacher B created/updated: ${teacherB.email} (${teacherB.id})`);

  const admin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
  });
  const adminId = admin ? admin.id : teacherA.id;

  // 3. Batch 1: For Teacher A to Review (S33 & S11)
  const batch1Id = 'c0000000-0000-0000-0000-000000000001';
  const batch1 = await prisma.itemBatch.upsert({
    where: { id: batch1Id },
    update: {
      status: ItemBatchStatus.IN_REVIEW,
    },
    create: {
      id: batch1Id,
      name: 'Lô Từ vựng B1 – Tuyển sinh đợt 1/2026',
      source: ItemBatchSource.AI_GENERATED,
      status: ItemBatchStatus.IN_REVIEW,
      skill: Skill.VOCABULARY,
      cefrTarget: CEFRLevel.B1,
      topicTag: 'Workplace Communication',
      requestedCount: 4,
      createdById: adminId,
    },
  });

  const dueReview = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const dueConfirm = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

  await prisma.item.deleteMany({
    where: { batchId: batch1.id },
  });

  // Batch 1 - Item 1: DRAFT with soft flag
  await prisma.item.create({
    data: {
      id: 'd0000000-0000-0000-0000-000000000001',
      batchId: batch1.id,
      content: 'The manager gave a clear _______ on how to handle the customer complaints.',
      options: {
        A: 'explanation',
        B: 'explain',
        C: 'explanatory',
        D: 'explaining',
      },
      correctAnswer: 'A',
      explanation: {
        create: {
          content: 'Sau tính từ clear cần một danh từ số ít (explanation).',
        },
      },
      skill: Skill.VOCABULARY,
      cefrTarget: CEFRLevel.B1,
      topicTag: 'Workplace Communication',
      irtB: -0.2,
      irtA: 1.1,
      irtC: 0.25,
      contentHash: sha256('The manager gave a clear explanation'),
      status: ItemStatus.DRAFT,
      reviewerId: teacherA.id,
      confirmerId: teacherB.id,
      firstReview: {
        dueAt: dueReview.toISOString(),
        action: null,
        reviewedAt: null,
        comment: null,
        originalSnapshot: null,
      },
      secondReview: {
        dueAt: dueConfirm.toISOString(),
        action: null,
        confirmedAt: null,
        comment: null,
      },
      checkResults: {
        create: {
          checkpoint: 'C2',
          level: 'SOFT',
          reasonCodes: ['DUPLICATE_SUSPECTED'],
          contentHash: sha256('The manager gave a clear explanation'),
        },
      },
    },
  });

  // Batch 1 - Item 2: DRAFT clean
  await prisma.item.create({
    data: {
      id: 'd0000000-0000-0000-0000-000000000002',
      batchId: batch1.id,
      content: 'It is important to _______ regular maintenance on all company equipment.',
      options: {
        A: 'perform',
        B: 'make',
        C: 'create',
        D: 'act',
      },
      correctAnswer: 'A',
      explanation: {
        create: {
          content: 'Cụm từ cố định: perform maintenance (thực hiện bảo trì).',
        },
      },
      skill: Skill.VOCABULARY,
      cefrTarget: CEFRLevel.B1,
      topicTag: 'Business English',
      irtB: 0.1,
      irtA: 1.25,
      irtC: 0.25,
      contentHash: sha256('It is important to perform regular maintenance'),
      status: ItemStatus.DRAFT,
      reviewerId: teacherA.id,
      confirmerId: teacherB.id,
      firstReview: {
        dueAt: dueReview.toISOString(),
        action: null,
        reviewedAt: null,
        comment: null,
        originalSnapshot: null,
      },
      secondReview: {
        dueAt: dueConfirm.toISOString(),
        action: null,
        confirmedAt: null,
        comment: null,
      },
    },
  });

  // Batch 1 - Item 3: FIRST_APPROVED (already edited and approved by A)
  await prisma.item.create({
    data: {
      id: 'd0000000-0000-0000-0000-000000000003',
      batchId: batch1.id,
      content: 'She decided to apply for the position despite having little _______ experience.',
      options: {
        A: 'relevant',
        B: 'relation',
        C: 'relevance',
        D: 'relate',
      },
      correctAnswer: 'A',
      explanation: {
        create: {
          content: 'Cần một tính từ đứng trước danh từ experience: relevant experience.',
        },
      },
      skill: Skill.VOCABULARY,
      cefrTarget: CEFRLevel.B1,
      topicTag: 'Employment',
      irtB: 0.3,
      irtA: 1.05,
      irtC: 0.25,
      contentHash: sha256('She decided to apply for the position despite having little relevant experience'),
      status: ItemStatus.FIRST_APPROVED,
      reviewerId: teacherA.id,
      confirmerId: teacherB.id,
      firstReview: {
        dueAt: dueReview.toISOString(),
        action: 'APPROVE',
        reviewedAt: new Date().toISOString(),
        comment: 'Đã sửa lại đáp án và giải thích cho rõ nghĩa hơn',
        originalSnapshot: {
          content: 'She decided to apply for the position despite having little _______ expr.',
          options: {
            A: 'relevant',
            B: 'relation',
            C: 'relevance',
            D: 'relate',
          },
          correctAnswer: 'A',
          explanation: 'Chưa có giải thích rõ.',
        },
      },
      secondReview: {
        dueAt: dueConfirm.toISOString(),
        action: null,
        confirmedAt: null,
        comment: null,
      },
    },
  });

  // Batch 1 - Item 4: REJECTED
  await prisma.item.create({
    data: {
      id: 'd0000000-0000-0000-0000-000000000004',
      batchId: batch1.id,
      content: 'The report was rejected due to numerous grammar errors.',
      options: {
        A: 'grammatical',
        B: 'grammar',
        C: 'grammarian',
        D: 'grammatically',
      },
      correctAnswer: 'A',
      explanation: {
        create: {
          content: 'Câu gốc không đạt tiêu chuẩn phân loại B1.',
        },
      },
      skill: Skill.VOCABULARY,
      cefrTarget: CEFRLevel.B1,
      topicTag: 'Grammar Accuracy',
      irtB: -0.5,
      irtA: 0.9,
      irtC: 0.25,
      contentHash: sha256('The report was rejected due to numerous grammar errors'),
      status: ItemStatus.REJECTED,
      reviewerId: teacherA.id,
      confirmerId: teacherB.id,
      firstReview: {
        dueAt: dueReview.toISOString(),
        action: 'REJECT',
        reviewedAt: new Date().toISOString(),
        comment: null,
        originalSnapshot: null,
      },
      secondReview: null,
    },
  });
  console.log(`✅ Batch 1 items created (4 items for Reviewer: Teacher A)`);

  // 4. Batch 2: For Teacher A to Confirm as Confirmer (S34 & S35)
  const batch2Id = 'c0000000-0000-0000-0000-000000000002';
  const batch2 = await prisma.itemBatch.upsert({
    where: { id: batch2Id },
    update: {
      status: ItemBatchStatus.IN_REVIEW,
    },
    create: {
      id: batch2Id,
      name: 'Lô Ngữ pháp B2 – Thẩm định Hội đồng Bộ môn',
      source: ItemBatchSource.IMPORTED,
      status: ItemBatchStatus.IN_REVIEW,
      skill: Skill.GRAMMAR,
      cefrTarget: CEFRLevel.B2,
      topicTag: 'Advanced Grammar',
      requestedCount: 3,
      createdById: adminId,
    },
  });

  await prisma.item.deleteMany({
    where: { batchId: batch2.id },
  });

  // Batch 2 - Item 1: FIRST_APPROVED (edited by Teacher B, pending confirmation by Teacher A)
  await prisma.item.create({
    data: {
      id: 'd0000000-0000-0000-0000-000000000005',
      batchId: batch2.id,
      content: 'Had I known about the changes in schedule, I _______ you earlier this morning.',
      options: {
        A: 'would have informed',
        B: 'will inform',
        C: 'had informed',
        D: 'would inform',
      },
      correctAnswer: 'A',
      explanation: {
        create: {
          content: 'Đảo ngữ câu điều kiện loại 3: Had + S + V3/ed, S + would have + V3/ed.',
        },
      },
      skill: Skill.GRAMMAR,
      cefrTarget: CEFRLevel.B2,
      topicTag: 'Inversion Conditionals',
      irtB: 0.85,
      irtA: 1.4,
      irtC: 0.25,
      contentHash: sha256('Had I known about the changes in schedule I would have informed you'),
      status: ItemStatus.FIRST_APPROVED,
      reviewerId: teacherB.id,
      confirmerId: teacherA.id,
      firstReview: {
        dueAt: dueReview.toISOString(),
        action: 'APPROVE',
        reviewedAt: new Date().toISOString(),
        comment: 'Đã chuẩn hóa cấu trúc đảo ngữ theo format chuẩn B2.',
        originalSnapshot: {
          content: 'If I knew about the schedule change, I _______ you earlier.',
          options: {
            A: 'would inform',
            B: 'will inform',
            C: 'had informed',
            D: 'would have informed',
          },
          correctAnswer: 'D',
          explanation: 'Câu gốc dùng điều kiện loại 2 lộn xộn.',
        },
      },
      secondReview: {
        dueAt: dueConfirm.toISOString(),
        action: null,
        confirmedAt: null,
        comment: null,
      },
    },
  });

  // Batch 2 - Item 2: FIRST_APPROVED (unedited, pending confirmation by Teacher A)
  await prisma.item.create({
    data: {
      id: 'd0000000-0000-0000-0000-000000000006',
      batchId: batch2.id,
      content: 'Scarcely had the president finished his keynote speech _______ the audience gave a standing ovation.',
      options: {
        A: 'when',
        B: 'than',
        C: 'then',
        D: 'as',
      },
      correctAnswer: 'A',
      explanation: {
        create: {
          content: 'Cấu trúc đảo ngữ: Scarcely / Hardly + had + S + V3/ed + WHEN + S + V2/ed.',
        },
      },
      skill: Skill.GRAMMAR,
      cefrTarget: CEFRLevel.B2,
      topicTag: 'Negative Inversion',
      irtB: 1.1,
      irtA: 1.5,
      irtC: 0.25,
      contentHash: sha256('Scarcely had the president finished his keynote speech when the audience gave a standing ovation'),
      status: ItemStatus.FIRST_APPROVED,
      reviewerId: teacherB.id,
      confirmerId: teacherA.id,
      firstReview: {
        dueAt: dueReview.toISOString(),
        action: 'APPROVE',
        reviewedAt: new Date().toISOString(),
        comment: 'Câu hỏi tốt, đạt độ khó B2.',
        originalSnapshot: null,
      },
      secondReview: {
        dueAt: dueConfirm.toISOString(),
        action: null,
        confirmedAt: null,
        comment: null,
      },
    },
  });

  // Batch 2 - Item 3: SECOND_APPROVED (already confirmed)
  await prisma.item.create({
    data: {
      id: 'd0000000-0000-0000-0000-000000000007',
      batchId: batch2.id,
      content: 'No sooner had they arrived at the airport _______ the flight was announced delayed.',
      options: {
        A: 'than',
        B: 'when',
        C: 'that',
        D: 'while',
      },
      correctAnswer: 'A',
      explanation: {
        create: {
          content: 'Cấu trúc No sooner ... THAN.',
        },
      },
      skill: Skill.GRAMMAR,
      cefrTarget: CEFRLevel.B2,
      topicTag: 'Negative Inversion',
      irtB: 0.9,
      irtA: 1.3,
      irtC: 0.25,
      contentHash: sha256('No sooner had they arrived at the airport than the flight was announced delayed'),
      status: ItemStatus.SECOND_APPROVED,
      reviewerId: teacherB.id,
      confirmerId: teacherA.id,
      firstReview: {
        dueAt: dueReview.toISOString(),
        action: 'APPROVE',
        reviewedAt: new Date().toISOString(),
        comment: 'Duyệt',
        originalSnapshot: null,
      },
      secondReview: {
        dueAt: dueConfirm.toISOString(),
        action: 'CONFIRM',
        confirmedAt: new Date().toISOString(),
        comment: 'Đạt yêu cầu ngân hàng câu hỏi',
      },
    },
  });
  console.log(`✅ Batch 2 items created (3 items for Confirmer: Teacher A)`);

  console.log('\n✨ Seed complete! You can now test with:');
  console.log('   Account: phamtranthiendang308@gmail.com');
  console.log('   Password: Password123@');
  console.log('   Role: TEACHER');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
