import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main() {
  const url = process.env.Q1Q8_TEST_DATABASE_URL ?? '';
  const secret = process.env.ADMIN_TEST_JWT_SECRET ?? '';
  if (!/^postgresql:\/\/[^@]+@127\.0\.0\.1:63655\/apt_ai_review_[0-9a-f]{8}\?schema=public$/.test(url) || secret.length < 32) throw new Error('Use the isolated test database and secret');
  const db = new PrismaClient({ datasources: { db: { url } } });
  const admin = randomUUID();
  const dir = join(tmpdir(), `apt-ai-e2e-${randomUUID()}`);
  mkdirSync(dir, { mode: 0o700 });
  try {
    await db.user.create({ data: { id: admin, email: `${admin}@example.test`, fullName: 'Test admin', role: 'ADMIN' } });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Questions');
    sheet.addRow(['Skill', 'CEFR', 'Topic', 'Question', 'A', 'B', 'C', 'D', 'Answer', 'Explanation', 'IRT']);
    sheet.addRow(['GRAMMAR', 'A2', '', 'Which word is a greeting?', 'Hello', 'Later', 'Quietly', 'Blue', 'A', 'Hello is a greeting.', 0]);
    await workbook.xlsx.writeFile(join(dir, 'questions.xlsx'));
    const token = new JwtService({ secret }).sign({ sub: admin, role: 'ADMIN' }, { expiresIn: '1h' });
    writeFileSync(join(dir, 'fixture.json'), JSON.stringify({ admin, token }), { mode: 0o600 });
    console.log(dir);
  } finally { await db.$disconnect(); }
}
void main();
