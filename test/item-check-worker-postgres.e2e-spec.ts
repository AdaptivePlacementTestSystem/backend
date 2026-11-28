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
import { ItemBatchJobStore } from '../src/modules/item-generation/infrastructure/item-batch-job.store';
import { ItemCheckWorker } from '../src/modules/item-generation/application/item-check-worker';
import { CheckExactDuplicatesUseCase } from '../src/modules/item-generation/application/check-exact-duplicates.use-case';
import { CheckNearDuplicatesUseCase } from '../src/modules/item-generation/application/check-near-duplicates.use-case';
import { CheckSemanticDuplicatesUseCase } from '../src/modules/item-generation/application/check-semantic-duplicates.use-case';
import { CheckIndependentAnswerUseCase } from '../src/modules/item-generation/application/check-independent-answer.use-case';
import { RunBatchChecksUseCase } from '../src/modules/item-generation/application/run-batch-checks.use-case';
import { contentFingerprint } from '../src/modules/item-generation/domain/content-fingerprint';

const url = process.env.Q1Q8_TEST_DATABASE_URL ?? '';
const safe =
  /^postgresql:\/\/[^@]+@127\.0\.0\.1:63655\/apt_ai_review_[0-9a-f]{8}\?schema=public$/.test(
    url,
  );
describe.skipIf(!safe)(
  'background C2 on isolated PostgreSQL with fake providers',
  () => {
    const db = new PrismaClient({ datasources: { db: { url } } });
    const admin = randomUUID(),
      batch = randomUUID();
    const content = `Synthetic test ${randomUUID()}`;
    const options = { A: 'Aye', B: 'Bee', C: 'See', D: 'Dee' };
    const explanation = 'The first option is correct.';
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
        },
      });
      await db.item.create({
        data: {
          batchId: batch,
          content,
          options,
          correctAnswer: 'A',
          skill: 'GRAMMAR',
          cefrTarget: 'A2',
          irtB: 0,
          status: 'DRAFT',
          contentHash: contentFingerprint({
            content,
            options,
            correctAnswer: 'A',
            explanation,
          }),
          explanation: { create: { content: explanation } },
        },
      });
      await db.itemBatchJob.create({
        data: {
          batchId: batch,
          kind: 'CHECK',
          availableAt: new Date('2000-01-01T00:00:00Z'),
        },
      });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
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
    it('runs C2 and commits a completed job', async () => {
      vi.stubEnv('LITELLM_BASE_URL', 'https://example.invalid');
      vi.stubEnv('LITELLM_API_KEY', 'fake');
      vi.stubEnv('LITELLM_MODEL', 'fake');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(
          async () =>
            new Response(
              JSON.stringify({
                model: 'fake',
                choices: [
                  {
                    finish_reason: 'stop',
                    message: {
                      content: JSON.stringify({
                        answer: 'A',
                        explanationSupportsAnswer: true,
                      }),
                    },
                  },
                ],
              }),
              { status: 200 },
            ),
        ),
      );
      const prisma = db as never;
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
        {} as never,
      );
      await worker.processOne();
      expect(
        (await db.itemBatch.findUniqueOrThrow({ where: { id: batch } })).status,
      ).toBe('READY_TO_ASSIGN');
      expect(
        (await db.itemBatchJob.findFirstOrThrow({ where: { batchId: batch } }))
          .status,
      ).toBe('DONE');
      expect(
        await db.itemCheckResult.count({
          where: { item: { batchId: batch }, checkpoint: 'C2' },
        }),
      ).toBeGreaterThan(0);
    });
  },
);
