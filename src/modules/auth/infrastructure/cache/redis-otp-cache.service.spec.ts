import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisOtpCacheService } from './redis-otp-cache.service';

/** Redis giả lập tối thiểu trong bộ nhớ (INCR atomic vì JS đơn luồng). */
function fakeRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  const api: any = {
    store,
    ttls,
    multi: () => {
      const ops: Array<() => void> = [];
      const chain: any = {
        set: (k: string, v: string | number, _ex: string, t: number) => {
          ops.push(() => {
            store.set(k, String(v));
            ttls.set(k, t);
          });
          return chain;
        },
        exec: async () => ops.forEach((op) => op()),
      };
      return chain;
    },
    mget: async (...keys: string[]) => keys.map((k) => store.get(k) ?? null),
    incr: async (k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      return n;
    },
    ttl: vi.fn(async (k: string) => ttls.get(k) ?? -2),
    expire: vi.fn(async (k: string, t: number) => {
      ttls.set(k, t);
      return 1;
    }),
    del: async (...keys: string[]) => keys.forEach((k) => store.delete(k)),
  };
  return api;
}

describe('RedisOtpCacheService', () => {
  let service: RedisOtpCacheService;
  let redis: ReturnType<typeof fakeRedis>;

  beforeEach(() => {
    service = new RedisOtpCacheService({ get: () => undefined } as any);
    redis = fakeRedis();
    (service as any).redis = redis;
  });

  it('lưu hash và đặt lại bộ đếm về 0 cùng TTL', async () => {
    await service.saveOtp('A@B.com', 'hash123', 600);

    expect(await service.getOtp('a@b.com')).toEqual({
      hash: 'hash123',
      attempts: 0,
    });
    expect(redis.ttls.get('auth:otp:reset:a@b.com:attempts')).toBe(600);
  });

  it('trả null khi chưa có OTP', async () => {
    expect(await service.getOtp('none@b.com')).toBeNull();
  });

  it('20 lần tăng song song cho ra các giá trị 1..20 không trùng (atomic)', async () => {
    await service.saveOtp('a@b.com', 'h', 600);

    const results = await Promise.all(
      Array.from({ length: 20 }, () => service.incrementAttempts('a@b.com')),
    );

    expect([...results].sort((x, y) => x - y)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    // Chỉ đúng 5 request đầu nằm trong giới hạn 5 lần thử
    expect(results.filter((n) => n <= 5)).toHaveLength(5);
  });

  it('gắn lại TTL cho bộ đếm khi key đếm đã hết hạn riêng', async () => {
    await service.saveOtp('a@b.com', 'h', 600);
    redis.store.delete('auth:otp:reset:a@b.com:attempts');
    redis.ttls.set('auth:otp:reset:a@b.com', 300);

    expect(await service.incrementAttempts('a@b.com')).toBe(1);
    expect(redis.expire).toHaveBeenCalledWith(
      'auth:otp:reset:a@b.com:attempts',
      300,
    );
  });

  it('deleteOtp xóa cả hash và bộ đếm', async () => {
    await service.saveOtp('a@b.com', 'h', 600);
    await service.deleteOtp('a@b.com');

    expect(await service.getOtp('a@b.com')).toBeNull();
    expect(redis.store.size).toBe(0);
  });
});
