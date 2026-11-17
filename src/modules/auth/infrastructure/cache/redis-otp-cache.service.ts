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

  /** Bộ đếm lần nhập sai nằm ở key riêng để tăng bằng INCR (atomic). */
  private getAttemptsKey(email: string): string {
    return `${this.getKey(email)}:attempts`;
  }

  async saveOtp(
    email: string,
    otpHash: string,
    ttlSeconds: number = this.defaultTtl,
  ): Promise<void> {
    // Ghi hash và đặt lại bộ đếm trong cùng một MULTI để không lệch TTL.
    await this.redis
      .multi()
      .set(this.getKey(email), otpHash, 'EX', ttlSeconds)
      .set(this.getAttemptsKey(email), 0, 'EX', ttlSeconds)
      .exec();
  }

  async getOtp(email: string): Promise<OtpRecord | null> {
    const [hash, attempts] = await this.redis.mget(
      this.getKey(email),
      this.getAttemptsKey(email),
    );
    if (!hash) return null;
    return { hash, attempts: Number(attempts ?? 0) };
  }

  /**
   * Tăng bộ đếm bằng INCR (atomic, giữ nguyên TTL của key). Gọi TRƯỚC khi so
   * khớp OTP để các request song song không vượt quá số lần thử cho phép.
   */
  async incrementAttempts(email: string): Promise<number> {
    const key = this.getAttemptsKey(email);
    const attempts = await this.redis.incr(key);
    if (attempts === 1) {
      // Key bộ đếm đã hết hạn riêng: gắn lại TTL bằng TTL còn lại của OTP.
      const ttl = await this.redis.ttl(this.getKey(email));
      if (ttl > 0) await this.redis.expire(key, ttl);
    }
    return attempts;
  }

  async deleteOtp(email: string): Promise<void> {
    await this.redis.del(this.getKey(email), this.getAttemptsKey(email));
  }
}
