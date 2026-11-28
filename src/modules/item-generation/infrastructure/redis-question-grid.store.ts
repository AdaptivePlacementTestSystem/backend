import {
  BadRequestException,
  ConflictException,
  Logger,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import type { ImportedCandidate } from '../application/parse-question-spreadsheet.use-case';

export interface QuestionGridRow {
  rowKey: string;
  candidate: ImportedCandidate;
}

// Lưới dùng hash theo rowKey; mọi thao tác gộp giới hạn số dòng là nguyên tử.
const MERGE = `
if redis.call('EXISTS', KEYS[3]) == 1 then return -2 end
local incoming = cjson.decode(ARGV[1])
local maxRows = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local count = redis.call('HLEN', KEYS[1])
if redis.call('HEXISTS', KEYS[1], '__grid__') == 1 then count = count - 1 end
if redis.call('HEXISTS', KEYS[1], '__operation__') == 1 then count = count - 1 end
local seen = {}
local added = 0
for _, row in ipairs(incoming) do
  if not seen[row.rowKey] and redis.call('HEXISTS', KEYS[1], row.rowKey) == 0 then
    seen[row.rowKey] = true
    added = added + 1
  end
end
if count + added > maxRows then return -1 end
redis.call('HSET', KEYS[1], '__grid__', '1')
redis.call('HSET', KEYS[1], '__operation__', ARGV[5])
for _, row in ipairs(incoming) do
  redis.call('HSETNX', KEYS[1], row.rowKey, cjson.encode(row))
end
redis.call('EXPIRE', KEYS[1], ttl)
redis.call('SET', KEYS[2], '1', 'EX', ARGV[4])
return added
`;

import {
  createGridRedisClient,
  evalGridMerge,
  parseGridSnapshot,
  readGridConfig,
  type RedisGridConfig,
} from '../../../shared/cache/redis-grid.helper';

@Injectable()
export class RedisQuestionGridStore implements OnModuleInit, OnModuleDestroy {
  private redis!: Redis;
  private readonly logger = new Logger(RedisQuestionGridStore.name);
  private readonly gridCfg: RedisGridConfig;
  private get ttl(): number {
    return this.gridCfg.ttl;
  }
  private get markerTtl(): number {
    return this.gridCfg.markerTtl;
  }
  constructor(private readonly config: ConfigService) {
    this.gridCfg = readGridConfig(config);
  }
  onModuleInit(): void {
    this.redis = createGridRedisClient(
      this.config,
      this.logger,
      'Không kết nối được Redis cho lưới câu hỏi',
    );
  }
  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }
  private key(adminId: string): string {
    return `import:questions:${adminId}`;
  }
  private lockKey(adminId: string): string {
    return `import:questions:lock:${adminId}`;
  }
  private markerKey(adminId: string): string {
    return `import:questions:seen:${adminId}`;
  }
  async hasExpired(adminId: string): Promise<boolean> {
    const result = await this.redis.eval(
      "if redis.call('EXISTS', KEYS[1]) == 0 and redis.call('EXISTS', KEYS[2]) == 1 then return 1 else return 0 end",
      2,
      this.key(adminId),
      this.markerKey(adminId),
    );
    return result === 1;
  }
  async snapshot(
    adminId: string,
  ): Promise<{ operationId: string; rows: QuestionGridRow[] } | null> {
    const entries = await this.redis.hgetall(this.key(adminId));
    return parseGridSnapshot<QuestionGridRow>(entries);
  }
  async load(adminId: string): Promise<QuestionGridRow[] | null> {
    return (await this.snapshot(adminId))?.rows ?? null;
  }
  async merge(adminId: string, rows: QuestionGridRow[]): Promise<number> {
    if (rows.some((row) => !row.rowKey || row.rowKey.startsWith('__'))) {
      throw new BadRequestException('Dòng không hợp lệ');
    }
    return evalGridMerge(
      this.redis,
      MERGE,
      [this.key(adminId), this.markerKey(adminId), this.lockKey(adminId)],
      rows,
      this.gridCfg,
    );
  }
  async remove(adminId: string, rowKey: string): Promise<void> {
    if (rowKey.startsWith('__'))
      throw new BadRequestException('Dòng không hợp lệ');
    const result = await this.redis.eval(
      "if redis.call('EXISTS', KEYS[2]) == 1 then return -1 end local removed = redis.call('HDEL', KEYS[1], ARGV[1]); if removed == 1 then redis.call('HSET', KEYS[1], '__operation__', ARGV[2]); redis.call('EXPIRE', KEYS[1], ARGV[3]); redis.call('SET', KEYS[3], '1', 'EX', ARGV[4]) end return removed",
      3,
      this.key(adminId),
      this.lockKey(adminId),
      this.markerKey(adminId),
      rowKey,
      randomUUID(),
      this.ttl,
      this.markerTtl,
    );
    if (result === -1) throw new ConflictException('Lưới đang được lưu');
  }
  async clear(adminId: string): Promise<void> {
    const result = await this.redis.eval(
      "if redis.call('EXISTS', KEYS[3]) == 1 then return -1 end return redis.call('DEL', KEYS[1], KEYS[2])",
      3,
      this.key(adminId),
      this.markerKey(adminId),
      this.lockKey(adminId),
    );
    if (result === -1) throw new ConflictException('Lưới đang được lưu');
  }
  async acquireSave(adminId: string, token: string): Promise<boolean> {
    return (
      (await this.redis.set(
        this.lockKey(adminId),
        token,
        'EX',
        this.markerTtl,
        'NX',
      )) === 'OK'
    );
  }
  async releaseSave(adminId: string, token: string): Promise<void> {
    await this.redis.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
      1,
      this.lockKey(adminId),
      token,
    );
  }
  async clearCommitted(adminId: string, operationId: string): Promise<void> {
    await this.redis.eval(
      "if redis.call('HGET', KEYS[1], '__operation__') == ARGV[1] then return redis.call('DEL', KEYS[1], KEYS[2], KEYS[3]) end return 0",
      3,
      this.key(adminId),
      this.markerKey(adminId),
      this.lockKey(adminId),
      operationId,
    );
  }
}
