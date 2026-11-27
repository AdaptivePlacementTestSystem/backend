import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reserveAiCall } from '../src/modules/item-generation/infrastructure/ai-budget';

const url = process.env.Q1Q8_TEST_DATABASE_URL ?? '';
const safe =
  /^postgresql:\/\/[^@]+@127\.0\.0\.1:63655\/apt_ai_review_[0-9a-f]{8}\?schema=public$/.test(
    url,
  );
describe.skipIf(!safe)('per-batch AI budget on isolated PostgreSQL', () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const admin = randomUUID(),
    batch = randomUUID();
  beforeAll(async () => {
    await db.user.create({
      data: {
        id: admin,
        email: `${admin}@example.test`,
        fullName: 'Test',
        role: 'ADMIN',
      },
    });
    await db.itemBatch.create({
      data: {
        id: batch,
        source: 'IMPORTED',
        createdById: admin,
        status: 'CHECKING',
        aiCallCount: 249,
      },
    });
  });
  afterAll(async () => {
    await db.itemBatch.deleteMany({ where: { id: batch } });
    await db.user.deleteMany({ where: { id: admin } });
    await db.$disconnect();
  });
  it('allows only one of several concurrent calls at the limit', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => reserveAiCall(db as never, batch)),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      (await db.itemBatch.findUniqueOrThrow({ where: { id: batch } }))
        .aiCallCount,
    ).toBe(250);
    await expect(reserveAiCall(db as never, batch)).rejects.toThrow(
      'AI_BUDGET_EXCEEDED',
    );
  });
});
