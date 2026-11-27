import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ItemBatchJobStore } from '../src/modules/item-generation/infrastructure/item-batch-job.store';
import { CheckExactDuplicatesUseCase } from '../src/modules/item-generation/application/check-exact-duplicates.use-case';
import { ItemCheckWorker } from '../src/modules/item-generation/application/item-check-worker';

const url = process.env.Q1Q8_TEST_DATABASE_URL ?? '';
const safe =
  /^postgresql:\/\/[^@]+@127\.0\.0\.1:63655\/apt_ai_review_[0-9a-f]{8}\?schema=public$/.test(
    url,
  );
describe.skipIf(!safe)('item batch job leases on isolated PostgreSQL', () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const store = new ItemBatchJobStore(db as never);
  const admin = randomUUID();
  const batch = randomUUID();
  beforeAll(async () => {
    if (await db.itemBatchJob.count()) throw new Error('Queue test requires an empty dedicated test database');
    await db.user.create({
      data: {
        id: admin,
        email: `${admin}@example.test`,
        fullName: 'Test admin',
        role: 'ADMIN',
      },
    });
    await db.itemBatch.create({
      data: {
        id: batch,
        source: 'IMPORTED',
        createdById: admin,
        status: 'CHECKING',
      },
    });
    await db.itemBatchJob.create({ data: { batchId: batch, kind: 'CHECK' } });
  });
  it('processes a queued check using a live database lease', async () => {
    await db.itemBatch.update({
      where: { id: batch },
      data: { status: 'CHECKING' },
    });
    await db.itemBatchJob.updateMany({
      where: { batchId: batch, kind: 'CHECK' },
      data: {
        status: 'PENDING',
        leaseToken: null,
        leaseUntil: null,
        attempts: 0,
        availableAt: new Date('2000-01-01T00:00:00Z'),
      },
    });
    const checks = {
      execute: async () => {
        await db.itemBatch.update({
          where: { id: batch },
          data: { status: 'READY_TO_ASSIGN' },
        });
      },
    };
    const worker = new ItemCheckWorker(db as never, store, checks as never, {} as never);
    await worker.processOne();
    expect(
      (await db.itemBatchJob.findFirstOrThrow({ where: { batchId: batch } }))
        .status,
    ).toBe('DONE');
  });
  afterAll(async () => {
    await db.itemCheckResult.deleteMany({
      where: { item: { batchId: batch } },
    });
    await db.item.deleteMany({ where: { batchId: batch } });
    await db.itemBatch.deleteMany({ where: { id: batch } });
    await db.user.deleteMany({ where: { id: admin } });
    await db.$disconnect();
  });
  it('claims once, recovers an expired lease, and fences the old token', async () => {
    await db.itemBatchJob.updateMany({
      where: { batchId: batch, kind: 'CHECK' },
      data: {
        status: 'PENDING',
        leaseToken: null,
        leaseUntil: null,
        attempts: 0,
        availableAt: new Date('2000-01-01T00:00:00Z'),
      },
    });
    const [a, b] = await Promise.all([store.claim(30, 4), store.claim(30, 4)]);
    const claimed = [a, b].filter((value) => value !== null);
    expect(claimed).toHaveLength(1);
    const first = claimed[0]!;
    expect(first.batchId).toBe(batch);
    await db.itemBatchJob.update({
      where: { id: first.id },
      data: { leaseUntil: new Date(Date.now() - 1000) },
    });
    const second = await store.claim(30, 4);
    expect(second?.leaseToken).not.toBe(first.leaseToken);
    expect(await store.finish(first.id, first.leaseToken)).toBe(false);
    await db.item.createMany({
      data: [1, 2].map((index) => ({
        batchId: batch,
        content: `Question ${index}`,
        options: { A: 'a', B: 'b', C: 'c', D: 'd' },
        correctAnswer: 'A',
        skill: 'GRAMMAR',
        cefrTarget: 'A2',
        irtB: 0,
        contentHash: 'a'.repeat(64),
        status: 'DRAFT',
      })),
    });
    const t1 = new CheckExactDuplicatesUseCase(db as never);
    await expect(
      t1.execute(batch, 'C2', {
        jobId: first.id,
        token: first.leaseToken,
        batchId: batch,
      }),
    ).rejects.toThrow();
    expect(
      await db.item.count({ where: { batchId: batch, status: 'AI_REJECTED' } }),
    ).toBe(0);
    await t1.execute(batch, 'C2', {
      jobId: second!.id,
      token: second!.leaseToken,
      batchId: batch,
    });
    expect(
      await db.item.count({ where: { batchId: batch, status: 'AI_REJECTED' } }),
    ).toBe(1);
    expect(await store.renew(second!.id, second!.leaseToken, 30)).toBe(true);
    expect(await store.fail(second!.id, second!.leaseToken, 0, 4)).toBe(true);
    const third = await store.claim(30, 4);
    expect(third?.attempts).toBe(3);
    expect(await store.finish(third!.id, third!.leaseToken)).toBe(true);
    expect(await store.claim(30, 4)).toBeNull();
  });
  it('marks a job failed when its retry limit is reached', async () => {
    await db.itemBatchJob.updateMany({
      where: { batchId: batch, kind: 'CHECK' },
      data: {
        status: 'PENDING',
        leaseToken: null,
        leaseUntil: null,
        attempts: 2,
        availableAt: new Date('2000-01-01T00:00:00Z'),
      },
    });
    const job = await store.claim(30, 3);
    expect(job?.attempts).toBe(3);
    expect(await store.fail(job!.id, job!.leaseToken, 0, 3)).toBe(true);
    expect(
      (await db.itemBatchJob.findUniqueOrThrow({ where: { id: job!.id } }))
        .status,
    ).toBe('FAILED');
  });
});
