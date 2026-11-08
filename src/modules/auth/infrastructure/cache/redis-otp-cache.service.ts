import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  IOtpCacheRepository,
  OtpRecord,
} from '../../domain/repositories/otp-cache.repository.interface';

@Injectable()
export class RedisOtpCacheService
  implements IOtpCacheRepository, OnModuleInit, OnModuleDestroy
{
  private redis: Redis;
  private readonly logger = new Logger(RedisOtpCacheService.name);
  private readonly defaultTtl = 600; // 10 phút (SRS BR-14, SD_08)

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('redis.host') ?? 'localhost';
    const port = this.configService.get<number>('redis.port') ?? 6379;

    this.redis = new Redis({
      host,
      port,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    this.redis.connect().catch((err) => {
      this.logger.warn(
        `RedisOtpCache: Không thể kết nối Redis tại ${host}:${port}: ${err.message}`,
      );
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => {});
    }
  }

  private getKey(email: string): string {
    return `auth:otp:reset:${email.trim().toLowerCase()}`;
  }

  async saveOtp(
    email: string,
    otpHash: string,
    ttlSeconds: number = this.defaultTtl,
  ): Promise<void> {
    const key = this.getKey(email);
    const data: OtpRecord = { hash: otpHash, attempts: 0 };
    await this.redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
  }

  async getOtp(email: string): Promise<OtpRecord | null> {
    const key = this.getKey(email);
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OtpRecord;
    } catch {
      return null;
    }
  }

  async incrementAttempts(email: string): Promise<number> {
    const key = this.getKey(email);
    const raw = await this.redis.get(key);
    if (!raw) return 0;

    try {
      const data = JSON.parse(raw) as OtpRecord;
      data.attempts += 1;
      const ttl = await this.redis.ttl(key);
      if (ttl > 0) {
        await this.redis.set(key, JSON.stringify(data), 'EX', ttl);
      }
      return data.attempts;
    } catch {
      return 0;
    }
  }

  async deleteOtp(email: string): Promise<void> {
    const key = this.getKey(email);
    await this.redis.del(key);
  }
}
