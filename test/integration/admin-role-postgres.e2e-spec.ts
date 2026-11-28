import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { PrismaUserRepository } from '../../src/modules/auth/infrastructure/persistence/prisma-user.repository';
import { UserRole } from '../../src/modules/auth/domain/enums/user-role.enum';

const testUrl = process.env.ADMIN_TEST_DATABASE_URL;
const parsed = testUrl ? new URL(testUrl) : undefined;
if (
  parsed &&
  (!['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.pathname !== '/apt_admin_test')
) {
  throw new Error(
    'ADMIN_TEST_DATABASE_URL must point to the isolated local apt_admin_test database',
  );
}
const suite = testUrl ? describe : describe.skip;
suite('atomic admin role changes in PostgreSQL', () => {
  const prisma = new PrismaService({ datasourceUrl: testUrl });
  const repository = new PrismaUserRepository(prisma);
  const a = randomUUID();
  const b = randomUUID();
  const student = randomUUID();
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.createMany({
      data: [
        {
          id: a,
          email: `${a}@example.test`,
          fullName: 'Admin A',
          role: 'ADMIN',
        },
        {
          id: b,
          email: `${b}@example.test`,
          fullName: 'Admin B',
          role: 'ADMIN',
        },
        {
          id: student,
          email: `${student}@example.test`,
          fullName: 'SV',
          role: 'STUDENT',
        },
      ],
    });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a, b, student] } } });
    await prisma.$disconnect();
  });
  it('rejects self-demotion and student role changes', async () => {
    expect(await repository.changeRoleAtomically(a, a, UserRole.TEACHER)).toBe(
      'FORBIDDEN',
    );
    expect(
      await repository.changeRoleAtomically(a, student, UserRole.ADMIN),
    ).toBe('INVALID_TARGET');
  });
  it('prevents two admins concurrently revoking each other', async () => {
    const results = await Promise.all([
      repository.changeRoleAtomically(a, b, UserRole.TEACHER),
      repository.changeRoleAtomically(b, a, UserRole.TEACHER),
    ]);
    expect(results.sort()).toEqual(['FORBIDDEN', 'UPDATED']);
    const remaining = await prisma.user.count({
      where: { id: { in: [a, b] }, role: 'ADMIN', isActive: true },
    });
    expect(remaining).toBe(1);
  });
  it('serializes promotion against account locking', async () => {
    await prisma.user.update({
      where: { id: a },
      data: { role: 'ADMIN', isActive: true },
    });
    await prisma.user.update({
      where: { id: b },
      data: { role: 'TEACHER', isActive: true },
    });
    const results = await Promise.all([
      repository.changeRoleAtomically(a, b, UserRole.ADMIN),
      repository.setActiveAtomically(a, b, false),
    ]);
    const target = await prisma.user.findUniqueOrThrow({ where: { id: b } });
    expect(results).toContain('UPDATED');
    // If promotion wins, a subsequent lock must be rejected; if locking wins,
    // the existing semantics permit promotion of a locked teacher.
    if (results[1] === 'FORBIDDEN') expect(target.isActive).toBe(true);
    expect(await repository.setActiveAtomically(a, a, false)).toBe('FORBIDDEN');
    expect(await repository.setActiveAtomically(a, a, true)).toBe('UNCHANGED');
    expect(
      await repository.changeRoleAtomically(a, randomUUID(), UserRole.ADMIN),
    ).toBe('NOT_FOUND');
    expect(await repository.setActiveAtomically(a, randomUUID(), false)).toBe(
      'NOT_FOUND',
    );
  });
});
