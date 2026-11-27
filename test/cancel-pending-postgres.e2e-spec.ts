import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CancelPendingUseCase } from '../src/modules/item-generation/application/cancel-pending.use-case';

const url = process.env.Q1Q8_TEST_DATABASE_URL ?? '';
const safe =
  /^postgresql:\/\/[^@]+@127\.0\.0\.1:63655\/apt_ai_review_[0-9a-f]{8}\?schema=public$/.test(
    url,
  );
describe.skipIf(!safe)('cancel pending on isolated PostgreSQL', () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const admin = randomUUID(),
    batches = [randomUUID(), randomUUID()];
  beforeAll(async () => {
    await db.user.create({
      data: {
        id: admin,
        email: `${admin}@example.test`,
        fullName: 'Admin',
        role: 'ADMIN',
      },
    });
    await db.itemBatch.createMany({
      data: batches.map((id) => ({
        id,
        source: 'IMPORTED',
        createdById: admin,
        status: 'IN_REVIEW',
      })),
    });
    const rows = [
      { batchId: batches[0], status: 'DRAFT' as const },
      { batchId: batches[0], status: 'FIRST_APPROVED' as const },
      { batchId: batches[0], status: 'SECOND_APPROVED' as const },
      { batchId: batches[1], status: 'DRAFT' as const },
    ];
    await db.item.createMany({
      data: rows.map((row, index) => ({
        ...row,
        content: `Synthetic ${index}`,
        options: { A: 'a', B: 'b', C: 'c', D: 'd' },
        correctAnswer: 'A',
        skill: 'GRAMMAR',
        cefrTarget: 'A2',
        irtB: 0,
      })),
    });
  });
  afterAll(async () => {
    await db.itemReviewEvent.deleteMany({
      where: { batchId: { in: batches } },
    });
    await db.item.deleteMany({ where: { batchId: { in: batches } } });
    await db.itemBatch.deleteMany({ where: { id: { in: batches } } });
    await db.user.deleteMany({ where: { id: admin } });
    await db.$disconnect();
  });
  it('audits one event and preserves already approved items', async () => {
    const service = new CancelPendingUseCase(db as never);
    await expect(service.execute(batches[0], admin, '  ')).rejects.toThrow();
    expect(
      await service.execute(batches[0], admin, 'Thay đổi kế hoạch'),
    ).toMatchObject({
      cancelled: 2,
      counts: { DRAFT: 1, FIRST_APPROVED: 1 },
      status: 'READY_TO_FINALIZE',
    });
    expect(
      await db.item.count({
        where: { batchId: batches[0], status: 'SECOND_APPROVED' },
      }),
    ).toBe(1);
    const event = await db.itemReviewEvent.findFirstOrThrow({
      where: { batchId: batches[0], action: 'CANCEL_PENDING' },
    });
    expect(event.itemId).toBeNull();
    expect(event.details).toMatchObject({
      reason: 'Thay đổi kế hoạch',
      updatedCount: 2,
    });
  });
  it('marks a nonempty batch DONE when all items are terminal', async () => {
    expect(
      await new CancelPendingUseCase(db as never).execute(
        batches[1],
        admin,
        'Dừng duyệt',
      ),
    ).toMatchObject({ cancelled: 1, status: 'DONE' });
  });
});
