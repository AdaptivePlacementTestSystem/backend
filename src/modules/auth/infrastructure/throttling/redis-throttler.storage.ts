import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

/** INCR + PEXPIRE nguyên tử; trả [số lần gọi, TTL còn lại (ms)]. */
const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) ttl = tonumber(ARGV[1]) end
return {hits, ttl}
`;

/**
 * ThrottlerStorage lưu bộ đếm trên Redis (D3, DECISIONS_LOG #134) để bền qua
 * restart và dùng chung giữa nhiều instance. Cửa sổ cố định theo `ttl`;
 * `blockDuration` không dùng (bị chặn đến hết cửa sổ).
 *
 * Gói `@nest-lab/throttler-storage-redis` chưa khai báo hỗ trợ NestJS 12 trong
 * peerDependencies nên dùng cài đặt nhỏ riêng này.
 */
@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnModuleDestroy
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `auth:throttle:${throttlerName}:${key}`;
    try {
      const [hits, pttl] = (await this.redis.eval(
        INCREMENT_SCRIPT,
        1,
        redisKey,
        ttl,
      )) as [number, number];
      const isBlocked = hits > limit;
      return {
        totalHits: hits,
        timeToExpire: Math.ceil(pttl / 1000),
        isBlocked,
        timeToBlockExpire: isBlocked ? Math.ceil(pttl / 1000) : 0,
      };
    } catch (err) {
      // Fail-open: Redis lỗi thì không chặn đăng nhập, chỉ ghi log (cần xác nhận với nhóm).
      this.logger.error(
        `Không ghi được bộ đếm rate-limit: ${(err as Error).message}`,
      );
      return {
        totalHits: 0,
        timeToExpire: 0,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
