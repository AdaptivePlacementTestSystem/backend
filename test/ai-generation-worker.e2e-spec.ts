import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CreateAiBatchUseCase } from '../src/modules/item-generation/application/create-ai-batch.use-case';
import { ProcessAiBatchUseCase } from '../src/modules/item-generation/application/process-ai-batch.use-case';
import { ItemCheckWorker } from '../src/modules/item-generation/application/item-check-worker';
import { ItemBatchJobStore } from '../src/modules/item-generation/infrastructure/item-batch-job.store';
import { CheckExactDuplicatesUseCase } from '../src/modules/item-generation/application/check-exact-duplicates.use-case';
import { CheckNearDuplicatesUseCase } from '../src/modules/item-generation/application/check-near-duplicates.use-case';
import { CheckSemanticDuplicatesUseCase } from '../src/modules/item-generation/application/check-semantic-duplicates.use-case';
import { CheckIndependentAnswerUseCase } from '../src/modules/item-generation/application/check-independent-answer.use-case';
import { RunBatchChecksUseCase } from '../src/modules/item-generation/application/run-batch-checks.use-case';

const url = process.env.Q1Q8_TEST_DATABASE_URL ?? '';
const safe =
  /^postgresql:\/\/[^@]+@127\.0\.0\.1:63655\/apt_ai_review_[0-9a-f]{8}\?schema=public$/.test(
    url,
  );
describe.skipIf(!safe)(
  'AI generation job on isolated PostgreSQL and fake providers',
  () => {
    const db = new PrismaClient({ datasources: { db: { url } } });
    const admin = randomUUID(),
      sourceBatch = randomUUID(),
      operationId = randomUUID();
    const sampleIds = [randomUUID(), randomUUID(), randomUUID()];
    const options = { A: 'Hello', B: 'Later', C: 'Blue', D: 'Quietly' };
    beforeAll(async () => {
      if (await db.itemBatchJob.count())
        throw new Error('Queue test requires an empty dedicated test database');
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
          id: sourceBatch,
          source: 'IMPORTED',
          createdById: admin,
          status: 'DONE',
        },
      });
      await db.item.createMany({
        data: sampleIds.map((id, index) => ({
          id,
          batchId: sourceBatch,
          content: `Example reference ${index} ${randomUUID()}`,
          options,
          correctAnswer: 'A',
          skill: 'GRAMMAR',
          cefrTarget: 'A2',
          irtB: 0,
          status: 'FINAL_APPROVED',
          approvedById: admin,
          approvedAt: new Date(),
        })),
      });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });
    afterAll(async () => {
      const ids = (
        await db.itemBatch.findMany({
          where: { createdById: admin },
          select: { id: true },
        })
      ).map((item) => item.id);
      await db.itemCheckResult.deleteMany({
        where: { item: { batchId: { in: ids } } },
      });
      await db.item.deleteMany({ where: { batchId: { in: ids } } });
      await db.itemBatch.deleteMany({ where: { id: { in: ids } } });
      await db.user.deleteMany({ where: { id: admin } });
      await db.$disconnect();
    });
    it('creates once, generates under lease, records reference ids, and runs C1', async () => {
      vi.stubEnv('LITELLM_BASE_URL', 'https://example.invalid');
      vi.stubEnv('LITELLM_API_KEY', 'fake');
      vi.stubEnv('LITELLM_MODEL', 'fake');
      const generated = {
        content: `A new synthetic question ${randomUUID()}`,
        options,
        correctAnswer: 'A',
        explanation: 'Hello is a greeting.',
        skill: 'GRAMMAR',
        cefrTarget: 'A2',
        irtB: 0,
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async (_url, init) => {
          const prompt = JSON.parse(init.body).messages[0].content as string;
          const content = prompt.startsWith('Generate ')
            ? JSON.stringify([generated])
            : JSON.stringify({ answer: 'A', explanationSupportsAnswer: true });
          return new Response(
            JSON.stringify({
              model: 'fake',
              choices: [{ finish_reason: 'stop', message: { content } }],
            }),
            { status: 200 },
          );
        }),
      );
      const prisma = db as never;
      const creator = new CreateAiBatchUseCase(
        prisma,
        new ConfigService({ AI_GENERATION_MAX_ITEMS: 20 }),
      );
      const input = {
        skill: 'GRAMMAR' as const,
        cefrTarget: 'A2' as const,
        count: 1,
        operationId,
      };
      const [first, concurrent] = await Promise.all([
        creator.execute(admin, input),
        creator.execute(admin, input),
      ]);
      expect(concurrent).toEqual(first);
      expect(await creator.execute(admin, input)).toEqual(first);
      await expect(creator.execute(randomUUID(), input)).rejects.toThrow();
      const checks = new RunBatchChecksUseCase(
        prisma,
        new CheckExactDuplicatesUseCase(prisma),
        new CheckNearDuplicatesUseCase(prisma),
        new CheckSemanticDuplicatesUseCase(prisma, {
          model: 'fake',
          embed: async (texts) => texts.map(() => [1, 0]),
        }),
        new CheckIndependentAnswerUseCase(prisma),
      );
      const worker = new ItemCheckWorker(
        prisma,
        new ItemBatchJobStore(prisma),
        checks,
        new ProcessAiBatchUseCase(prisma),
      );
      await worker.processOne();
      const item = await db.item.findFirstOrThrow({
        where: { batchId: first.batchId },
      });
      expect(new Set(item.generatedFromRefIds)).toEqual(new Set(sampleIds));
      expect(
        (await db.itemBatch.findUniqueOrThrow({ where: { id: first.batchId } }))
          .status,
      ).toBe('CHECKING');
      await worker.processOne();
      expect(
        (await db.itemBatch.findUniqueOrThrow({ where: { id: first.batchId } }))
          .status,
      ).toBe('READY_TO_ASSIGN');
      expect(
        (await db.itemBatch.findUniqueOrThrow({ where: { id: first.batchId } }))
          .aiCallCount,
      ).toBe(4);
      expect(
        (
          await db.itemBatchJob.findMany({ where: { batchId: first.batchId } })
        ).map((job) => job.status),
      ).toEqual(['DONE', 'DONE']);
    });
    it('discards a stale generation result and recovers it under a new lease', async () => {
      vi.stubEnv('LITELLM_BASE_URL', 'https://example.invalid');
      vi.stubEnv('LITELLM_API_KEY', 'fake');
      vi.stubEnv('LITELLM_MODEL', 'fake');
      const prisma = db as never;
      const operationId = randomUUID();
      const created = await new CreateAiBatchUseCase(
        prisma,
        new ConfigService({ AI_GENERATION_MAX_ITEMS: 20 }),
      ).execute(admin, {
        skill: 'GRAMMAR',
        cefrTarget: 'A2',
        count: 1,
        operationId,
      });
      const generated = {
        content: `Recovered question ${randomUUID()}`,
        options,
        correctAnswer: 'A',
        explanation: 'Hello is a greeting.',
        skill: 'GRAMMAR',
        cefrTarget: 'A2',
        irtB: 0,
      };
      let first = true;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () => {
          if (first) {
            first = false;
            await db.itemBatchJob.update({
              where: { id: operationId },
              data: { leaseUntil: new Date(Date.now() - 1000) },
            });
          }
          return new Response(
            JSON.stringify({
              model: 'fake',
              choices: [
                {
                  finish_reason: 'stop',
                  message: { content: JSON.stringify([generated]) },
                },
              ],
            }),
            { status: 200 },
          );
        }),
      );
      const worker = new ItemCheckWorker(
        prisma,
        new ItemBatchJobStore(prisma),
        {} as never,
        new ProcessAiBatchUseCase(prisma),
      );
      await worker.processOne();
      expect(await db.item.count({ where: { batchId: created.batchId } })).toBe(
        0,
      );
      await worker.processOne();
      expect(await db.item.count({ where: { batchId: created.batchId } })).toBe(
        1,
      );
      expect(
        (
          await db.itemBatch.findUniqueOrThrow({
            where: { id: created.batchId },
          })
        ).status,
      ).toBe('CHECKING');
      await db.itemBatchJob.deleteMany({
        where: { batchId: created.batchId, kind: 'CHECK' },
      });
    });
    it('reports insufficient reference items without calling the provider', async () => {
      vi.stubEnv('LITELLM_BASE_URL', 'https://example.invalid');
      vi.stubEnv('LITELLM_API_KEY', 'fake');
      vi.stubEnv('LITELLM_MODEL', 'fake');
      const fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      const prisma = db as never;
      const created = await new CreateAiBatchUseCase(
        prisma,
        new ConfigService({ AI_GENERATION_MAX_ITEMS: 20 }),
      ).execute(admin, {
        skill: 'VOCABULARY',
        cefrTarget: 'A2',
        count: 1,
        operationId: randomUUID(),
      });
      const worker = new ItemCheckWorker(
        prisma,
        new ItemBatchJobStore(prisma),
        {} as never,
        new ProcessAiBatchUseCase(prisma),
      );
      await worker.processOne();
      const job = await db.itemBatchJob.findFirstOrThrow({
        where: { batchId: created.batchId },
      });
      expect(job).toMatchObject({
        status: 'PENDING',
        lastError: 'INSUFFICIENT_REFERENCE_ITEMS',
        attempts: 1,
      });
      await db.itemBatchJob.update({
        where: { id: job.id },
        data: { attempts: 2, availableAt: new Date('2000-01-01T00:00:00Z') },
      });
      await worker.processOne();
      expect(
        await db.itemBatchJob.findUniqueOrThrow({ where: { id: job.id } }),
      ).toMatchObject({
        status: 'FAILED',
        lastError: 'INSUFFICIENT_REFERENCE_ITEMS',
        attempts: 3,
      });
      expect(fetcher).not.toHaveBeenCalled();
    });
  },
);
