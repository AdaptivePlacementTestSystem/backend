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

export interface RosterGridRow {
  studentId: string;
  studentCode: string;
  note: string;
}

// Lưới dùng hash theo studentId; mọi thao tác gộp giới hạn số dòng là nguyên tử.
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
  if not seen[row.studentId] and redis.call('HEXISTS', KEYS[1], row.studentId) == 0 then
    seen[row.studentId] = true
    added = added + 1
  end
end
if count + added > maxRows then return -1 end
redis.call('HSET', KEYS[1], '__grid__', '1')
redis.call('HSET', KEYS[1], '__operation__', ARGV[5])
for _, row in ipairs(incoming) do
  redis.call('HSETNX', KEYS[1], row.studentId, cjson.encode(row))
end
redis.call('EXPIRE', KEYS[1], ttl)
redis.call('SET', KEYS[2], '1', 'EX', ARGV[4])
return added
`;

@Injectable()
export class RedisRosterGridStore implements OnModuleInit, OnModuleDestroy {
  private redis!: Redis;
  private readonly logger = new Logger(RedisRosterGridStore.name);
  private readonly ttl: number;
  private readonly maxRows: number;
  private readonly markerTtl: number;
  constructor(private readonly config: ConfigService) {
    this.ttl = config.get<number>('accountImport.gridTtlSeconds') ?? 1800;
    this.maxRows = config.get<number>('accountImport.maxRows') ?? 1000;
    this.markerTtl = Math.max(
      this.ttl + 1,
      config.get<number>('accountImport.jobTtlSeconds') ?? 3600,
    );
  }
  onModuleInit(): void {
    this.redis = new Redis({
      host: this.config.get<string>('redis.host') ?? 'localhost',
      port: this.config.get<number>('redis.port') ?? 6379,
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', () =>
      this.logger.warn('Không kết nối được Redis cho lưới danh sách thi'),
    );
  }
  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }
  private key(adminId: string, roundId: string): string {
    return `import:roster:${adminId}:${roundId}`;
  }
  private lockKey(adminId: string, roundId: string): string {
    return `import:roster:lock:${adminId}:${roundId}`;
  }
  private markerKey(adminId: string, roundId: string): string {
    return `import:roster:seen:${adminId}:${roundId}`;
  }
  async hasExpired(adminId: string, roundId: string): Promise<boolean> {
    const result = await this.redis.eval(
      "if redis.call('EXISTS', KEYS[1]) == 0 and redis.call('EXISTS', KEYS[2]) == 1 then return 1 else return 0 end",
      2,
      this.key(adminId, roundId),
      this.markerKey(adminId, roundId),
    );
    return result === 1;
  }
  async snapshot(
    adminId: string,
    roundId: string,
  ): Promise<{ operationId: string; rows: RosterGridRow[] } | null> {
    const entries = await this.redis.hgetall(this.key(adminId, roundId));
    if (!entries.__grid__) return null;
    const operationId = entries.__operation__;
    if (!operationId)
      throw new ConflictException('Lưới thiếu mã thao tác; hãy xóa và tải lại');
    delete entries.__grid__;
    delete entries.__operation__;
    return {
      operationId,
      rows: Object.values(entries).map(
        (value) => JSON.parse(value) as RosterGridRow,
      ),
    };
  }
  async load(
    adminId: string,
    roundId: string,
  ): Promise<RosterGridRow[] | null> {
    return (await this.snapshot(adminId, roundId))?.rows ?? null;
  }
  async merge(
    adminId: string,
    roundId: string,
    rows: RosterGridRow[],
  ): Promise<number> {
    if (rows.some((row) => !row.studentId || row.studentId.startsWith('__'))) {
      throw new BadRequestException('Dòng không hợp lệ');
    }
    const result = await this.redis.eval(
      MERGE,
      3,
      this.key(adminId, roundId),
      this.markerKey(adminId, roundId),
      this.lockKey(adminId, roundId),
      JSON.stringify(rows),
      this.maxRows,
      this.ttl,
      this.markerTtl,
      randomUUID(),
    );
    if (result === -2) throw new ConflictException('Lưới đang được lưu');
    if (result === -1)
      throw new BadRequestException('Lưới vượt số dòng cho phép');
    return Number(result);
  }
  async remove(
    adminId: string,
    roundId: string,
    studentId: string,
  ): Promise<void> {
    if (studentId.startsWith('__'))
      throw new BadRequestException('Dòng không hợp lệ');
    const result = await this.redis.eval(
      "if redis.call('EXISTS', KEYS[2]) == 1 then return -1 end local removed = redis.call('HDEL', KEYS[1], ARGV[1]); if removed == 1 then redis.call('HSET', KEYS[1], '__operation__', ARGV[2]); redis.call('EXPIRE', KEYS[1], ARGV[3]); redis.call('SET', KEYS[3], '1', 'EX', ARGV[4]) end return removed",
      3,
      this.key(adminId, roundId),
      this.lockKey(adminId, roundId),
      this.markerKey(adminId, roundId),
      studentId,
      randomUUID(),
      this.ttl,
      this.markerTtl,
    );
    if (result === -1) throw new ConflictException('Lưới đang được lưu');
  }
  async clear(adminId: string, roundId: string): Promise<void> {
    const result = await this.redis.eval(
      "if redis.call('EXISTS', KEYS[3]) == 1 then return -1 end return redis.call('DEL', KEYS[1], KEYS[2])",
      3,
      this.key(adminId, roundId),
      this.markerKey(adminId, roundId),
      this.lockKey(adminId, roundId),
    );
    if (result === -1) throw new ConflictException('Lưới đang được lưu');
  }
  async acquireSave(
    adminId: string,
    roundId: string,
    token: string,
  ): Promise<boolean> {
    return (
      (await this.redis.set(
        this.lockKey(adminId, roundId),
        token,
        'EX',
        this.markerTtl,
        'NX',
      )) === 'OK'
    );
  }
  async releaseSave(
    adminId: string,
    roundId: string,
    token: string,
  ): Promise<void> {
    await this.redis.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0",
      1,
      this.lockKey(adminId, roundId),
      token,
    );
  }
  async clearCommitted(
    adminId: string,
    roundId: string,
    operationId: string,
  ): Promise<void> {
    await this.redis.eval(
      "if redis.call('HGET', KEYS[1], '__operation__') == ARGV[1] then return redis.call('DEL', KEYS[1], KEYS[2], KEYS[3]) end return 0",
      3,
      this.key(adminId, roundId),
      this.markerKey(adminId, roundId),
      this.lockKey(adminId, roundId),
      operationId,
    );
  }
}
