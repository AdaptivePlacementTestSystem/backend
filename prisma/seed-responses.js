const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');

const prisma = new PrismaClient();

async function main() {
  console.log('--- Checking and seeding responses for completed test sessions ---');
  
  const items = await prisma.item.findMany({
    take: 25,
    include: { explanation: true },
  });

  if (items.length === 0) {
    console.log('No items found in DB to attach as responses.');
    return;
  }

  const completedSessions = await prisma.testSession.findMany({
    where: { status: 'COMPLETED' },
    include: {
      responses: true,
      student: { select: { fullName: true } },
    },
  });

  console.log(`Found ${completedSessions.length} completed sessions.`);

  for (const session of completedSessions) {
    if (session.responses.length === 0) {
      console.log(`Seeding responses for session ${session.id} (${session.student.fullName})...`);
      
      const numQuestions = Math.min(items.length, 15);
      const responsesData = [];
      let currentTheta = session.thetaFinal ? session.thetaFinal - 0.5 : 0;

      for (let i = 0; i < numQuestions; i++) {
        const item = items[i];
        // 70% chance correct
        const isCorrect = Math.random() < 0.7;
        const chosen = isCorrect ? item.correctAnswer : (item.correctAnswer === 'A' ? 'B' : 'A');
        currentTheta += isCorrect ? 0.08 : -0.06;

        responsesData.push({
          id: randomUUID(),
          sessionId: session.id,
          itemId: item.id,
          response: chosen,
          isCorrect: isCorrect,
          thetaAfter: parseFloat(currentTheta.toFixed(3)),
          seAfter: parseFloat((0.8 - i * 0.03).toFixed(3)),
          responseTimeMs: Math.floor(15000 + Math.random() * 25000),
          answeredAt: new Date(session.startedAt.getTime() + (i + 1) * 60000),
        });
      }

      await prisma.sessionResponse.createMany({
        data: responsesData,
      });

      console.log(`✅ Created ${responsesData.length} responses for ${session.student.fullName}`);
    } else {
      console.log(`Session ${session.id} already has ${session.responses.length} responses.`);
    }
  }

  console.log('--- Done seeding session responses ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
