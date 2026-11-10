import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorCode } from '@apt/shared-types';
import { LoginFailureLimiter } from './login-failure-limiter';

function fakeRedis() {
  const store = new Map<string, number>();
  const ttls = new Map<string, number>();
  return {
    store,
    ttls,
    get: vi.fn(async (k: string) =>
      store.has(k) ? String(store.get(k)) : null,
    ),
    incr: vi.fn(async (k: string) => {
      const n = (store.get(k) ?? 0) + 1;
      store.set(k, n);
      return n;
    }),
    expire: vi.fn(async (k: string, t: number) => {
      ttls.set(k, t);
      return 1;
    }),
    ttl: vi.fn(async (k: string) => ttls.get(k) ?? -1),
  };
}

const invalidCredentials = () =>
  new UnauthorizedException({ code: ErrorCode.INVALID_CREDENTIALS });

describe('LoginFailureLimiter', () => {
  let limiter: LoginFailureLimiter;
  let redis: ReturnType<typeof fakeRedis>;
  const LIMIT = 3;

  beforeEach(() => {
    const config = {
      get: (key: string) =>
        ({
          'rateLimit.loginIpFailureLimit': LIMIT,
          'rateLimit.loginIpFailureTtlSeconds': 600,
        })[key],
    } as any;
    limiter = new LoginFailureLimiter(config);
    redis = fakeRedis();
    (limiter as any).redis = redis;
  });

  it('đăng nhập thành công không bị đếm: 500 lượt đăng nhập đúng từ cùng một IP đều qua', async () => {
    for (let i = 0; i < 500; i++) {
      await expect(limiter.run('10.0.0.1', async () => 'ok')).resolves.toBe(
        'ok',
      );
    }
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('đếm lần sai thông tin, đặt TTL ở lần đầu, chặn 429 khi chạm ngưỡng', async () => {
    const fail = () =>
      limiter.run('1.1.1.1', async () => Promise.reject(invalidCredentials()));

    for (let i = 0; i < LIMIT; i++) {
      await expect(fail()).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(redis.expire).toHaveBeenCalledTimes(1);
    expect(redis.expire).toHaveBeenCalledWith(
      'auth:login-fail:ip:1.1.1.1',
      600,
    );

    const action = vi.fn(async () => 'ok');
    const blocked = await limiter.run('1.1.1.1', action).catch((e) => e);
    expect(blocked).toBeInstanceOf(HttpException);
    expect((blocked as HttpException).getStatus()).toBe(429);
    expect((blocked as HttpException).getResponse()).toMatchObject({
      code: ErrorCode.RATE_LIMITED,
    });
    expect(action).not.toHaveBeenCalled();
  });

  it('IP khác không bị ảnh hưởng', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await limiter
        .run('1.1.1.1', async () => Promise.reject(invalidCredentials()))
        .catch(() => undefined);
    }
    await expect(limiter.run('2.2.2.2', async () => 'ok')).resolves.toBe('ok');
  });

  it('lỗi 403 tài khoản khóa hoặc lỗi khác không được đếm', async () => {
    await limiter
      .run('1.1.1.1', async () =>
        Promise.reject(
          new ForbiddenException({ code: ErrorCode.ACCOUNT_LOCKED }),
        ),
      )
      .catch(() => undefined);
    await limiter
      .run('1.1.1.1', async () => Promise.reject(new Error('boom')))
      .catch(() => undefined);

    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('Redis lỗi: không chặn đăng nhập (fail-open)', async () => {
    redis.get.mockRejectedValue(new Error('redis down'));
    redis.incr.mockRejectedValue(new Error('redis down'));

    await expect(limiter.run('1.1.1.1', async () => 'ok')).resolves.toBe('ok');
    await expect(
      limiter.run('1.1.1.1', async () => Promise.reject(invalidCredentials())),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
