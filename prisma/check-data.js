const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, fullName: true, role: true, mustChangePassword: true, studentProfile: true, teacherProfile: true },
  });
  console.log('=== USERS IN DB ===');
  console.log(`Total: ${users.length}`);
  users.forEach(u => console.log(`- [${u.role}] ${u.email} (${u.fullName}) - StudentCode: ${u.studentProfile?.studentCode || 'N/A'}, mustChangePassword: ${u.mustChangePassword}`));

  const examRounds = await prisma.examRound.findMany();
  console.log('\n=== EXAM ROUNDS ===');
  console.log(`Total: ${examRounds.length}`);
  examRounds.forEach(r => console.log(`- ${r.id}: ${r.name} (${r.status})`));

  const profiles = await prisma.languageProfile.findMany({
    include: { student: { select: { email: true, fullName: true } } },
  });
  console.log('\n=== LANGUAGE PROFILES ===');
  console.log(`Total: ${profiles.length}`);
  profiles.forEach(p => console.log(`- ${p.student.fullName} (${p.student.email}): CEFR ${p.cefrLevel}, theta ${p.theta}, SE ${p.standardError}`));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
