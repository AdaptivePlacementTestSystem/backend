import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GetAdminBatchUseCase } from '../src/modules/item-generation/application/get-admin-batch.use-case';

const url = process.env.Q1Q8_TEST_DATABASE_URL ?? '';
const safe =
  /^postgresql:\/\/[^@]+@127\.0\.0\.1:63655\/apt_ai_review_[0-9a-f]{8}\?schema=public$/.test(
    url,
  );
describe.skipIf(!safe)('AI rejected statistics on isolated PostgreSQL', () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const admin = randomUUID(),
    teacher = randomUUID(),
    batch = randomUUID(),
    item = randomUUID();
  beforeAll(async () => {
    await db.user.createMany({
      data: [
        {
          id: admin,
          email: `${admin}@example.test`,
          fullName: 'Admin',
          role: 'ADMIN',
        },
        {
          id: teacher,
          email: `${teacher}@example.test`,
          fullName: 'Teacher',
          role: 'TEACHER',
        },
      ],
    });
    await db.itemBatch.create({
      data: {
        id: batch,
        source: 'IMPORTED',
        createdById: admin,
        name: 'Stats batch',
        status: 'DONE',
      },
    });
    await db.item.create({
      data: {
        id: item,
        batchId: batch,
        content: 'Synthetic question',
        options: { A: 'a', B: 'b', C: 'c', D: 'd' },
        correctAnswer: 'A',
        skill: 'GRAMMAR',
        cefrTarget: 'A2',
        irtB: 0,
        status: 'AI_REJECTED',
        reviewerId: teacher,
      },
    });
    await db.itemCheckResult.createMany({
      data: [1, 2].map(() => ({
        itemId: item,
        checkpoint: 'C1',
        contentHash: 'a'.repeat(64),
        level: 'HARD',
        reasonCodes: ['DUPLICATE_EXACT'],
      })),
    });
  });
  afterAll(async () => {
    await db.itemCheckResult.deleteMany({ where: { itemId: item } });
    await db.item.deleteMany({ where: { id: item } });
    await db.itemBatch.deleteMany({ where: { id: batch } });
    await db.user.deleteMany({ where: { id: { in: [admin, teacher] } } });
    await db.$disconnect();
  });
  it('counts an item once per reason, batch and reviewer', async () => {
    const service = new GetAdminBatchUseCase(db as never);
    expect((await service.rejectedStats('reason', 1, 20)).data).toContainEqual({
      key: 'DUPLICATE_EXACT',
      label: 'DUPLICATE_EXACT',
      count: 1,
    });
    expect((await service.rejectedStats('batch', 1, 20)).data).toContainEqual({
      key: batch,
      label: 'Stats batch',
      count: 1,
    });
    expect(
      (await service.rejectedStats('reviewer', 1, 20)).data,
    ).toContainEqual({ key: teacher, label: 'Teacher', count: 1 });
  });
});
