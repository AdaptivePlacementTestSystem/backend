import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Skill } from '../../../item-bank/domain/enums/skill.enum';

export type SessionState = 'READY_FOR_NEXT' | 'WAITING_FOR_ANSWER';

export interface SessionCacheState {
  state: SessionState;
  currentItemId: string | null;
  theta: number;
  se: number;
  lastSkillPicked: Skill | null;
  itemsAdministered: string[];
  lastUpdated: string;
}

/**
 * RedisSessionCacheService — quản lý SessionCacheState trên Redis.
 * SRS Mục 15.5: State machine chống race condition (double submit / spam refresh)
 * TTL: 7200s (2 giờ)
 */
@Injectable()
export class RedisSessionCacheService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;
  private readonly logger = new Logger(RedisSessionCacheService.name);
  private readonly ttlSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.ttlSeconds = this.configService.get<number>('redis.ttlSeconds') ?? 7200;
  }

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
      this.logger.warn(`Không thể kết nối Redis tại ${host}:${port}. Chạy ở chế độ fallback memory/DB: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit().catch(() => {});
    }
  }

  private getKey(sessionId: string): string {
    return `session:${sessionId}:state`;
  }

  async getState(sessionId: string): Promise<SessionCacheState | null> {
    try {
      const data = await this.redis.get(this.getKey(sessionId));
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async setState(sessionId: string, state: SessionCacheState): Promise<void> {
    try {
      await this.redis.set(this.getKey(sessionId), JSON.stringify(state), 'EX', this.ttlSeconds);
    } catch (err: any) {
      this.logger.warn(`Lỗi ghi cache Redis session ${sessionId}: ${err.message}`);
    }
  }

  async deleteState(sessionId: string): Promise<void> {
    try {
      await this.redis.del(this.getKey(sessionId));
    } catch {}
  }
}
