import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { ImportJob, ImportKind, ImportRow } from '../domain/import.types';
import type { IImportGridStore, IImportJobStore } from '../domain/ports';

/**
 * Trạng thái import trong Redis (SRS mục VIII; tên khóa là đề xuất):
 *   import:accounts:{adminId}:{kind}       lưới tạm (JSON), TTL làm mới mỗi lần ghi
 *   import:accounts:job:{adminId}:{kind}   trạng thái lần Lưu gần nhất (JSON), không chứa mật khẩu
 *   import:accounts:lock:{adminId}:{kind}  khóa "đang Lưu" (SET NX EX)
 * Không có bảng PostgreSQL tương ứng (không thêm bảng import_batches).
 */
@Injectable()
export class RedisImportStateStore
  implements IImportGridStore, IImportJobStore, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisImportStateStore.name);
  private redis!: Redis;
  private readonly gridTtl: number;
  private readonly jobTtl: number;

  constructor(private readonly config: ConfigService) {
    this.gridTtl = config.get<number>('accountImport.gridTtlSeconds') ?? 1800;
    this.jobTtl = config.get<number>('accountImport.jobTtlSeconds') ?? 3600;
  }

  onModuleInit(): void {
    const host = this.config.get<string>('redis.host') ?? 'localhost';
    const port = this.config.get<number>('redis.port') ?? 6379;
    this.redis = new Redis({
      host,
      port,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    this.redis.connect().catch((error: Error) => {
      this.logger.warn(
        `ImportState: không kết nối được Redis ${host}:${port}: ${error.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }

  private key(
    kind: 'grid' | 'job' | 'lock',
    adminId: string,
    importKind: ImportKind,
  ): string {
    const prefix =
      kind === 'grid' ? 'import:accounts' : `import:accounts:${kind}`;
    return `${prefix}:${adminId}:${importKind}`;
  }

  // ── IImportGridStore ──
  async load(adminId: string, kind: ImportKind): Promise<ImportRow[] | null> {
    const raw = await this.redis.get(this.key('grid', adminId, kind));
    return raw === null ? null : (JSON.parse(raw) as ImportRow[]);
  }

  async store(
    adminId: string,
    kind: ImportKind,
    rows: ImportRow[],
  ): Promise<void> {
    await this.redis.set(
      this.key('grid', adminId, kind),
      JSON.stringify(rows),
      'EX',
      this.gridTtl,
    );
  }

  async clear(adminId: string, kind: ImportKind): Promise<void> {
    await this.redis.del(this.key('grid', adminId, kind));
  }

  // ── IImportJobStore ──
  async get(adminId: string, kind: ImportKind): Promise<ImportJob | null> {
    const raw = await this.redis.get(this.key('job', adminId, kind));
    return raw === null ? null : (JSON.parse(raw) as ImportJob);
  }

  async set(adminId: string, kind: ImportKind, job: ImportJob): Promise<void> {
    await this.redis.set(
      this.key('job', adminId, kind),
      JSON.stringify(job),
      'EX',
      this.jobTtl,
    );
  }

  async tryAcquire(adminId: string, kind: ImportKind): Promise<boolean> {
    const result = await this.redis.set(
      this.key('lock', adminId, kind),
      '1',
      'EX',
      this.jobTtl,
      'NX',
    );
    return result === 'OK';
  }

  async release(adminId: string, kind: ImportKind): Promise<void> {
    await this.redis.del(this.key('lock', adminId, kind));
  }
}
