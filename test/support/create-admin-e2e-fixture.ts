import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main() {
  const url = process.env.ADMIN_TEST_DATABASE_URL;
  const secret = process.env.ADMIN_TEST_JWT_SECRET;
  if (!url || !secret || secret.length < 32)
    throw new Error(
      'Cần ADMIN_TEST_DATABASE_URL và ADMIN_TEST_JWT_SECRET test',
    );
  const parsed = new URL(url);
  if (
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    parsed.pathname !== '/apt_admin_test'
  )
    throw new Error('Chỉ dùng DB apt_admin_test trên localhost');
  const db = new PrismaClient({ datasourceUrl: url });
  const admin = randomUUID(),
    student = randomUUID(),
    code = `E2E-${randomUUID().slice(0, 8)}`;
  const dir = join(tmpdir(), `apt-admin-e2e-${randomUUID()}`);
  mkdirSync(dir, { recursive: false, mode: 0o700 });
  try {
    await db.user.createMany({
      data: [
        {
          id: admin,
          email: `${admin}@example.test`,
          fullName: 'Admin kiểm thử',
          role: 'ADMIN',
        },
        {
          id: student,
          email: `${student}@example.test`,
          fullName: 'Sinh viên kiểm thử',
          role: 'STUDENT',
        },
      ],
    });
    await db.studentProfile.create({
      data: { userId: student, studentCode: code },
    });
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Danh sách').addRows([
      ['MSSV', 'Ghi chú'],
      [code, 'dữ liệu kiểm thử'],
    ]);
    await book.xlsx.writeFile(join(dir, 'roster.xlsx'));
    const jwt = new JwtService({ secret });
    const token = jwt.sign(
      { sub: admin, email: `${admin}@example.test`, role: 'ADMIN' },
      { expiresIn: '1h' },
    );
    writeFileSync(
      join(dir, 'fixture.json'),
      JSON.stringify({ admin, student, code, token }),
      { mode: 0o600 },
    );
    console.log(dir);
  } finally {
    await db.$disconnect();
  }
}
void main();
