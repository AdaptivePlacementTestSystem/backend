import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@apt/shared-types';
import Redis from 'ioredis';

/**
 * Giới hạn theo IP chỉ đếm lần đăng nhập THẤT BẠI (DECISIONS_LOG #135):
 * đăng nhập đúng không bị tính, nên phòng thi tập trung dùng chung một IP
 * (NAT của trường) không bị chặn nhầm; còn password spraying (hầu hết thất bại)
 * thì bị chặn khi vượt ngưỡng. Ngưỡng cấu hình qua env.
 *
 * Fail-open khi Redis lỗi (đồng nhất với RedisThrottlerStorage).
 */
@Injectable()
export class LoginFailureLimiter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoginFailureLimiter.name);
  private redis: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.redis = new Redis({
      host: this.configService.get<string>('redis.host') ?? 'localhost',
      port: this.configService.get<number>('redis.port') ?? 6379,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    this.redis.connect().catch((err: Error) => {
      this.logger.warn(
        `LoginFailureLimiter: không kết nối được Redis: ${err.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }

  /** Chạy `action`; chặn trước nếu IP đã vượt ngưỡng, đếm thêm khi action trả 401 sai thông tin. */
  async run<T>(ip: string, action: () => Promise<T>): Promise<T> {
    await this.assertNotBlocked(ip);
    try {
      return await action();
    } catch (err) {
      if (this.isInvalidCredentials(err)) {
        await this.recordFailure(ip);
      }
      throw err;
    }
  }

  private get limit(): number {
    return (
      this.configService.get<number>('rateLimit.loginIpFailureLimit') ?? 100
    );
  }

  private get ttlSeconds(): number {
    return (
      this.configService.get<number>('rateLimit.loginIpFailureTtlSeconds') ??
      600
    );
  }

  private key(ip: string): string {
    return `auth:login-fail:ip:${ip}`;
  }

  private async assertNotBlocked(ip: string): Promise<void> {
    let failures = 0;
    let ttl = 0;
    try {
      failures = Number((await this.redis.get(this.key(ip))) ?? 0);
      if (failures >= this.limit) ttl = await this.redis.ttl(this.key(ip));
    } catch (err) {
      this.logger.error(
        `Không đọc được bộ đếm đăng nhập sai: ${(err as Error).message}`,
      );
      return;
    }
    if (failures >= this.limit) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: `Quá nhiều lần đăng nhập sai từ địa chỉ này. Vui lòng thử lại sau ${Math.max(ttl, 1)} giây.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordFailure(ip: string): Promise<void> {
    try {
      const failures = await this.redis.incr(this.key(ip));
      if (failures === 1) {
        await this.redis.expire(this.key(ip), this.ttlSeconds);
      }
    } catch (err) {
      this.logger.error(
        `Không ghi được bộ đếm đăng nhập sai: ${(err as Error).message}`,
      );
    }
  }

  private isInvalidCredentials(err: unknown): boolean {
    if (!(err instanceof UnauthorizedException)) return false;
    const body = err.getResponse();
    return (
      typeof body === 'object' &&
      (body as { code?: string }).code === ErrorCode.INVALID_CREDENTIALS
    );
  }
}
