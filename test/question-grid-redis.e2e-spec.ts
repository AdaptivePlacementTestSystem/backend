import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisQuestionGridStore } from '../src/modules/item-generation/infrastructure/redis-question-grid.store';

const port = Number(process.env.ADMIN_TEST_REDIS_PORT);
describe.skipIf(port !== 63657)('question grid on isolated Redis', () => {
  const admin = randomUUID(),
    other = randomUUID();
  const config = {
    get: (key: string) =>
      (
        ({
          'redis.host': '127.0.0.1',
          'redis.port': port,
          'accountImport.gridTtlSeconds': 2,
          'accountImport.maxRows': 2,
        }) as Record<string, string | number>
      )[key],
  } as unknown as ConfigService;
  const store = new RedisQuestionGridStore(config);
  const row = (rowKey: string) => ({
    rowKey,
    candidate: {
      content: rowKey,
      options: {},
      correctAnswer: '',
      explanation: '',
      skill: '',
      cefrTarget: '',
      topicTag: '',
      irtB: 0,
    },
  });
  beforeAll(() => store.onModuleInit());
  afterAll(async () => {
    await store.clear(admin);
    await store.clear(other);
    await store.onModuleDestroy();
  });
  it('merges atomically, limits rows and isolates admins', async () => {
    const results = await Promise.all([
      store.merge(admin, [row('a')]),
      store.merge(admin, [row('a'), row('b')]),
    ]);
    expect(results[0] + results[1]).toBe(2);
    await expect(store.merge(admin, [row('c')])).rejects.toThrow();
    await store.merge(other, [row('x')]);
    await store.remove(admin, 'a');
    expect(await store.load(admin)).toEqual([row('b')]);
    expect(await store.load(other)).toEqual([row('x')]);
  });
  it('prevents mutation during save and rejects stale cleanup', async () => {
    const snapshot = await store.snapshot(admin);
    expect(snapshot).not.toBeNull();
    expect(await store.acquireSave(admin, 'token')).toBe(true);
    await expect(store.merge(admin, [row('c')])).rejects.toThrow();
    await store.releaseSave(admin, 'token');
    await store.merge(admin, [row('c')]);
    await store.clearCommitted(admin, snapshot!.operationId);
    expect(await store.load(admin)).toHaveLength(2);
  });
  it('reports expiry of a created grid', async () => {
    await new Promise((resolve) => setTimeout(resolve, 2300));
    expect(await store.load(admin)).toBeNull();
    expect(await store.hasExpired(admin)).toBe(true);
  });
  it('refreshes the grid lifetime after a row is removed', async () => {
    await store.merge(admin, [row('a'), row('b')]);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await store.remove(admin, 'a');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await store.load(admin)).toEqual([row('b')]);
  });
});
