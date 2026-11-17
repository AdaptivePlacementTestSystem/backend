import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ImportJob, ImportKind } from '../../domain/import.types';
import {
  IMPORT_GRID_STORE,
  IMPORT_JOB_STORE,
  type IImportGridStore,
  type IImportJobStore,
} from '../../domain/ports';
import { ImportSaveWorker } from '../import-save-worker';
import {
  importGridEmpty,
  importGridExpired,
  importJobRunning,
} from '../import-errors';

/**
 * Nút Lưu: kiểm lưới (hết hạn → 410, rỗng → 422), giữ chỗ tác vụ (đang chạy → 409), rồi chạy nền và trả ngay.
 * Giao diện theo dõi tiến độ bằng `GetImportSaveStatusUseCase`.
 */
@Injectable()
export class SaveImportUseCase {
  private readonly logger = new Logger(SaveImportUseCase.name);

  constructor(
    @Inject(IMPORT_GRID_STORE) private readonly grid: IImportGridStore,
    @Inject(IMPORT_JOB_STORE) private readonly jobs: IImportJobStore,
    private readonly worker: ImportSaveWorker,
  ) {}

  async execute(adminId: string, kind: ImportKind): Promise<{ total: number }> {
    const rows = await this.grid.load(adminId, kind);
    if (rows === null) throw importGridExpired();
    if (rows.length === 0) throw importGridEmpty();

    if (!(await this.jobs.tryAcquire(adminId, kind))) throw importJobRunning();

    const startedAt = new Date().toISOString();
    await this.jobs.set(adminId, kind, {
      status: 'PROCESSING',
      total: rows.length,
      processed: 0,
      startedAt,
    });
    // Chạy nền: không chờ. `run` tự ghi mọi kết quả vào trạng thái job và giải phóng chỗ.
    void this.worker
      .run(adminId, kind, rows, startedAt)
      .catch((error: Error) =>
        this.logger.error(
          `Tác vụ Lưu import thoát bất thường: ${error.message}`,
        ),
      );
    return { total: rows.length };
  }
}

export type ImportSaveStatus = ImportJob | { status: 'NONE' };

/** Trạng thái lần Lưu gần nhất của (admin, loại tài khoản); `NONE` khi chưa có hoặc đã hết hạn. */
@Injectable()
export class GetImportSaveStatusUseCase {
  constructor(
    @Inject(IMPORT_JOB_STORE) private readonly jobs: IImportJobStore,
  ) {}

  async execute(adminId: string, kind: ImportKind): Promise<ImportSaveStatus> {
    return (await this.jobs.get(adminId, kind)) ?? { status: 'NONE' };
  }
}
