import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { RedisRosterGridStore } from '../../src/modules/exam-round/infrastructure/redis-roster-grid.store';

const port = Number(process.env.ADMIN_TEST_REDIS_PORT);
const suite = port > 0 ? describe : describe.skip;
suite('roster grid on isolated Redis', () => {
  const admin = randomUUID();
  const other = randomUUID();
  const round = randomUUID();
  const otherRound = randomUUID();
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
  const store = new RedisRosterGridStore(config);
  const row = (studentId: string) => ({
    studentId,
    studentCode: studentId,
    note: '',
  });
  beforeAll(() => store.onModuleInit());
  afterAll(async () => {
    await Promise.all([
      store.clear(admin, round),
      store.clear(admin, otherRound),
      store.clear(other, round),
    ]);
    await store.onModuleDestroy();
  });
  it('gộp nguyên tử, bỏ dòng trùng và giới hạn số dòng', async () => {
    expect(await store.load(admin, round)).toBeNull();
    const results = await Promise.all([
      store.merge(admin, round, [row('a')]),
      store.merge(admin, round, [row('a'), row('b')]),
    ]);
    expect(results.reduce((a, b) => a + b, 0)).toBe(2);
    expect(await store.load(admin, round)).toHaveLength(2);
    await expect(store.merge(admin, round, [row('c')])).rejects.toThrow();
    expect(await store.load(admin, round)).toHaveLength(2);
  });
  it('cô lập theo admin và kỳ, xóa dòng hoặc lưới', async () => {
    await store.merge(other, round, [row('x')]);
    await store.merge(admin, otherRound, [row('y')]);
    await store.remove(admin, round, 'a');
    expect(await store.load(admin, round)).toHaveLength(1);
    expect(await store.load(other, round)).toEqual([row('x')]);
    expect(await store.load(admin, otherRound)).toEqual([row('y')]);
    await store.clear(admin, round);
    expect(await store.load(admin, round)).toBeNull();
    expect(await store.load(other, round)).toEqual([row('x')]);
  });
  it('phân biệt lưới hết TTL với lưới chưa tạo', async () => {
    await store.merge(admin, round, [row('z')]);
    await new Promise((resolve) => setTimeout(resolve, 2300));
    expect(await store.load(admin, round)).toBeNull();
    expect(await store.hasExpired(admin, round)).toBe(true);
    await store.clear(admin, round);
    expect(await store.hasExpired(admin, round)).toBe(false);
  });
  it('làm mới TTL khi xóa một dòng', async () => {
    await store.merge(admin, round, [row('a'), row('b')]);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await store.remove(admin, round, 'a');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await store.load(admin, round)).toEqual([row('b')]);
  });
});
