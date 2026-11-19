const { PrismaClient, UserRole, SessionStatus, StoppingReason, CEFRLevel, CEFRConfidence } = require('@prisma/client');
const argon2 = require('argon2');
const { randomUUID } = require('crypto');

const prisma = new PrismaClient();

async function main() {
  console.log('--- Updating teacher and seeding rich test reports data ---');

  // 1. Ensure teacher.demo@example.test has password Teacher@123456 and mustChangePassword = false
  const teacherHash = await argon2.hash('Teacher@123456');
  const teacher = await prisma.user.upsert({
    where: { email: 'teacher.demo@example.test' },
    update: {
      passwordHash: teacherHash,
      mustChangePassword: false,
    },
    create: {
      id: randomUUID(),
      email: 'teacher.demo@example.test',
      fullName: 'ThS. Hoàng Nam',
      role: UserRole.TEACHER,
      authProvider: 'LOCAL',
      passwordHash: teacherHash,
      mustChangePassword: false,
      teacherProfile: { create: { teacherCode: 'GV-DEMO-001' } },
    },
  });
  console.log('✅ Teacher updated: teacher.demo@example.test / Teacher@123456');

  // 2. Ensure students have valid profiles
  const studentHash = await argon2.hash('Student@123456');
  const sampleStudents = [
    { email: 'student1@example.test', fullName: 'Nguyễn Minh Anh', code: 'SV-DEMO-001', theta: 0.42, cefr: CEFRLevel.B1 },
    { email: 'student2@example.test', fullName: 'Trần Bảo Long', code: 'SV-DEMO-002', theta: 1.55, cefr: CEFRLevel.B2 },
    { email: 'student3@example.test', fullName: 'Lê Hoàng Nam', code: 'SV-DEMO-003', theta: -0.45, cefr: CEFRLevel.A2 },
    { email: 'student4@example.test', fullName: 'Phạm Thu Trang', code: 'SV-DEMO-004', theta: 2.15, cefr: CEFRLevel.C1_PLUS },
    { email: 'student5@example.test', fullName: 'Đỗ Hữu Nghĩa', code: 'SV-DEMO-005', theta: -1.40, cefr: CEFRLevel.A1 },
    { email: 'student6@example.test', fullName: 'Vũ Thanh Thảo', code: 'SV-DEMO-006', theta: -2.30, cefr: CEFRLevel.PRE_A1 },
  ];

  const examRounds = await prisma.examRound.findMany();
  const examRound = examRounds[0];

  for (const st of sampleStudents) {
    const user = await prisma.user.upsert({
      where: { email: st.email },
      update: {
        fullName: st.fullName,
        mustChangePassword: false,
        passwordHash: studentHash,
      },
      create: {
        id: randomUUID(),
        email: st.email,
        fullName: st.fullName,
        role: UserRole.STUDENT,
        authProvider: 'LOCAL',
        passwordHash: studentHash,
        mustChangePassword: false,
        studentProfile: { create: { studentCode: st.code } },
      },
      include: { studentProfile: true },
    });

    if (!user.studentProfile) {
      await prisma.studentProfile.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          studentCode: st.code,
        },
      });
    }

    if (examRound) {
      // Upsert participant
      await prisma.examRoundParticipant.upsert({
        where: {
          roundId_studentId: {
            roundId: examRound.id,
            studentId: user.id,
          },
        },
        update: {},
        create: {
          roundId: examRound.id,
          studentId: user.id,
        },
      });

      // Add session & profile if not already present
      const existingSession = await prisma.testSession.findFirst({
        where: { studentId: user.id },
      });

      if (!existingSession) {
        const sessionId = randomUUID();
        const completedAt = new Date(Date.now() - Math.floor(Math.random() * 7 * 86400000));
        await prisma.testSession.create({
          data: {
            id: sessionId,
            studentId: user.id,
            examRoundId: examRound.id,
            status: SessionStatus.COMPLETED,
            startedAt: new Date(completedAt.getTime() - 45 * 60000),
            completedAt: completedAt,
            expiresAt: new Date(completedAt.getTime() + 60 * 60000),
            stoppingReason: StoppingReason.SE_THRESHOLD,
            thetaFinal: st.theta,
            seFinal: 0.32,
          },
        });

        await prisma.languageProfile.create({
          data: {
            id: randomUUID(),
            studentId: user.id,
            testSessionId: sessionId,
            completedAt: completedAt,
            theta: st.theta,
            standardError: 0.32,
            confidenceInterval95: [parseFloat((st.theta - 1.96 * 0.32).toFixed(2)), parseFloat((st.theta + 1.96 * 0.32).toFixed(2))],
            cefrLevel: st.cefr,
            cefrConfidence: CEFRConfidence.HIGH,
            boundaryEffect: false,
            skillProfiles: [
              { skill: 'VOCABULARY', itemsAdministered: 13, correctCount: 9, accuracyRate: 0.69 },
              { skill: 'GRAMMAR', itemsAdministered: 12, correctCount: 8, accuracyRate: 0.67 },
            ],
            errorPatterns: [
              { topicTag: 'relative_clauses', skill: 'GRAMMAR', itemsAttempted: 4, correctCount: 1, accuracyRate: 0.25, severity: 'HIGH' },
              { topicTag: 'phrasal_verbs', skill: 'VOCABULARY', itemsAttempted: 5, correctCount: 2, accuracyRate: 0.40, severity: 'MEDIUM' },
              { topicTag: 'perfect_continuous', skill: 'GRAMMAR', itemsAttempted: 4, correctCount: 2, accuracyRate: 0.50, severity: 'LOW' },
            ],
            aiRecommendations: [
              'Ưu tiên ôn tập mệnh đề quan hệ và các dạng rút gọn mệnh đề.',
              'Củng cố vốn từ cụm động từ (Phrasal Verbs) thông dụng trong ngữ cảnh học thuật.',
            ],
            testMetadata: {
              itemsAdministered: 25,
              algorithm: 'CAT-Rasch-1PL',
              thetaFinal: st.theta,
              seFinal: 0.32,
            },
          },
        });
        console.log(`✅ Seeded completed session & profile for ${st.fullName} (${st.code}, CEFR ${st.cefr})`);
      }
    }
  }

  console.log('--- Seeding completed successfully ---');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
