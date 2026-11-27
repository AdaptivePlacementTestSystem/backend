import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssignmentPreviewUseCase } from '../src/modules/item-generation/application/assignment-preview.use-case';
import { AssignBatchUseCase } from '../src/modules/item-generation/application/assign-batch.use-case';

const url = process.env.Q1Q8_TEST_DATABASE_URL ?? '';
const safe =
  /^postgresql:\/\/[^@]+@127\.0\.0\.1:63655\/apt_ai_review_[0-9a-f]{8}\?schema=public$/.test(
    url,
  );
describe.skipIf(!safe)('assignment preview on isolated PostgreSQL', () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const admin = randomUUID(),
    a = randomUUID(),
    b = randomUUID(),
    c = randomUUID(),
    batch = randomUUID();
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  beforeAll(async () => {
    await db.user.createMany({
      data: [admin, a, b, c].map((id, index) => ({
        id,
        email: `${id}@example.test`,
        fullName: id,
        role: index ? 'TEACHER' : 'ADMIN',
      })),
    });
    await db.itemBatch.create({
      data: {
        id: batch,
        source: 'IMPORTED',
        createdById: admin,
        status: 'READY_TO_ASSIGN',
      },
    });
    await db.item.createMany({
      data: ids.map((id, index) => ({
        id,
        batchId: batch,
        content: `Question ${index}`,
        options: { A: 'a', B: 'b', C: 'c', D: 'd' },
        correctAnswer: 'A',
        skill: index === 2 ? 'VOCABULARY' : 'GRAMMAR',
        cefrTarget: 'A2',
        irtB: 0,
        status: 'DRAFT',
      })),
    });
  });
  afterAll(async () => {
    await db.itemReviewEvent.deleteMany({ where: { batchId: batch } });
    await db.item.deleteMany({ where: { batchId: batch } });
    await db.itemBatch.deleteMany({ where: { id: batch } });
    await db.user.deleteMany({ where: { id: { in: [admin, a, b, c] } } });
    await db.$disconnect();
  });
  it('detects a changed item and permits only one concurrent assignment', async () => {
    const preview = new AssignmentPreviewUseCase(db as never),
      assign = new AssignBatchUseCase(db as never);
    const initial = await preview.execute(batch, [a, b]);
    expect(initial.assignments.map((item) => item.reviewerId)).toEqual([
      a,
      b,
      a,
    ]);
    await db.item.update({ where: { id: ids[0] }, data: { cefrTarget: 'B1' } });
    const request = {
      confirmerId: c,
      firstDueAt: '2099-01-01T00:00:00Z',
      secondDueAt: '2099-01-02T00:00:00Z',
      assignments: initial.assignments.map(({ itemId, reviewerId }) => ({
        itemId,
        reviewerId,
      })),
      batchRevision: initial.batchRevision,
    };
    await expect(assign.execute(batch, admin, request)).rejects.toThrow();
    const fresh = await preview.execute(batch, [a, b]);
    const revised = {
      ...request,
      batchRevision: fresh.batchRevision,
      assignments: fresh.assignments.map(({ itemId, reviewerId }) => ({
        itemId,
        reviewerId,
      })),
    };
    const outcomes = await Promise.allSettled([
      assign.execute(batch, admin, revised),
      assign.execute(batch, admin, revised),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await db.itemReviewEvent.count({
        where: { batchId: batch, action: 'ASSIGN' },
      }),
    ).toBe(3);
  });
});
