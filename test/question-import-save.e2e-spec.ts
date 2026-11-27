import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QuestionGridUseCase } from '../src/modules/item-generation/application/question-grid.use-case';
import { SaveQuestionImportUseCase } from '../src/modules/item-generation/application/save-question-import.use-case';
import { RedisQuestionGridStore } from '../src/modules/item-generation/infrastructure/redis-question-grid.store';

const databaseUrl = process.env.Q1Q8_TEST_DATABASE_URL ?? '';
const validDb =
  /^postgresql:\/\/[^@]+@127\.0\.0\.1:63655\/apt_ai_review_[0-9a-f]{8}\?schema=public$/.test(
    databaseUrl,
  );
describe.skipIf(!validDb || process.env.ADMIN_TEST_REDIS_PORT !== '63657')(
  'question import save on isolated PostgreSQL and Redis',
  () => {
    const admin = randomUUID();
    const config = {
      get: (key: string) =>
        (
          ({ 'redis.host': '127.0.0.1', 'redis.port': 63657 }) as Record<
            string,
            string | number
          >
        )[key],
    } as unknown as ConfigService;
    const grid = new RedisQuestionGridStore(config);
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const saver = new SaveQuestionImportUseCase(db as never);
    const service = new QuestionGridUseCase({} as never, grid, saver);
    const candidate = {
      content: 'What is the correct response?',
      options: { A: 'Yes', B: 'No', C: 'Maybe', D: 'Later' },
      correctAnswer: 'A',
      explanation: 'Yes is the answer.',
      skill: 'GRAMMAR',
      cefrTarget: 'A2',
      topicTag: '',
      irtB: 0,
    };
    beforeAll(async () => {
      grid.onModuleInit();
      await db.user.create({
        data: {
          id: admin,
          email: `${admin}@example.test`,
          fullName: 'Test admin',
          role: 'ADMIN',
        },
      });
    });
    afterAll(async () => {
      await grid.clear(admin);
      await grid.onModuleDestroy();
      const batches = await db.itemBatch.findMany({
        where: { createdById: admin },
        select: { id: true },
      });
      const ids = batches.map((batch) => batch.id);
      await db.item.deleteMany({ where: { batchId: { in: ids } } });
      await db.itemBatch.deleteMany({ where: { id: { in: ids } } });
      await db.user.deleteMany({ where: { id: admin } });
      await db.$disconnect();
    });
    it('recovers the same batch after cleanup fails following a committed save', async () => {
      vi.spyOn(grid, 'clearCommitted').mockRejectedValueOnce(
        new Error('fake Redis disconnect'),
      );
      await grid.merge(admin, [{ rowKey: 'first', candidate }]);
      const operationId = (await grid.snapshot(admin))!.operationId;
      await expect(service.save(admin, { operationId })).rejects.toThrow();
      const first = await db.itemBatch.findUniqueOrThrow({
        where: { importOperationId: operationId },
      });
      const retry = await service.save(admin, { operationId });
      expect(retry).toMatchObject({
        batchId: first.id,
        status: 'CHECKING',
        count: 1,
      });
      expect(
        await db.itemBatch.count({ where: { importOperationId: operationId } }),
      ).toBe(1);
      expect(
        await db.itemBatchJob.count({
          where: { batchId: first.id, kind: 'CHECK' },
        }),
      ).toBe(1);
      expect(await grid.load(admin)).toBeNull();
    });
    it('refuses an operation belonging to another admin', async () => {
      const first = await db.itemBatch.findFirstOrThrow({
        where: { createdById: admin },
      });
      await expect(
        service.save(randomUUID(), { operationId: first.importOperationId! }),
      ).rejects.toThrow();
    });
    it('creates only one batch when save requests overlap', async () => {
      await grid.merge(admin, [
        {
          rowKey: 'second',
          candidate: { ...candidate, content: 'Another question?' },
        },
      ]);
      const operationId = (await grid.snapshot(admin))!.operationId;
      const results = await Promise.allSettled([
        service.save(admin, { operationId }),
        service.save(admin, { operationId }),
      ]);
      expect(results.some((result) => result.status === 'fulfilled')).toBe(
        true,
      );
      expect(
        await db.itemBatch.count({
          where: { importOperationId: operationId },
        }),
      ).toBe(1);
    });
    it('splits 51 questions into two recoverable batches with one job each', async () => {
      const rows = Array.from({ length: 51 }, (_, index) => ({
        rowKey: `split-${index}`,
        candidate: {
          ...candidate,
          content: `Unique synthetic split question ${index}?`,
        },
      }));
      await grid.merge(admin, rows);
      const operationId = (await grid.snapshot(admin))!.operationId;
      const first = await service.save(admin, { operationId, name: 'Split' });
      expect(first.batches.map((entry) => entry.count)).toEqual([50, 1]);
      expect(first.count).toBe(51);
      expect(
        await db.itemBatchJob.count({
          where: { batchId: { in: first.batchIds }, kind: 'CHECK' },
        }),
      ).toBe(2);
      expect((await service.save(admin, { operationId })).batchIds).toEqual(
        first.batchIds,
      );
    });
  },
);
