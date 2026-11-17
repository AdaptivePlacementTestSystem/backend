import { Inject, Injectable } from '@nestjs/common';
import type { ImportKind, ImportRow } from '../../domain/import.types';
import { IMPORT_GRID_STORE, type IImportGridStore } from '../../domain/ports';

/** Xem lưới tạm hiện có (rỗng nếu chưa có hoặc đã hết hạn). */
@Injectable()
export class GetImportGridUseCase {
  constructor(
    @Inject(IMPORT_GRID_STORE) private readonly grid: IImportGridStore,
  ) {}

  async execute(
    adminId: string,
    kind: ImportKind,
  ): Promise<{ grid: ImportRow[] }> {
    return { grid: (await this.grid.load(adminId, kind)) ?? [] };
  }
}

/** Xóa một dòng khỏi lưới. Dòng không tồn tại thì không đổi gì (idempotent). */
@Injectable()
export class RemoveImportRowUseCase {
  constructor(
    @Inject(IMPORT_GRID_STORE) private readonly grid: IImportGridStore,
  ) {}

  async execute(
    adminId: string,
    kind: ImportKind,
    rowKey: string,
  ): Promise<{ grid: ImportRow[] }> {
    const current = await this.grid.load(adminId, kind);
    if (current === null) return { grid: [] };
    const next = current.filter((row) => row.rowKey !== rowKey);
    if (next.length !== current.length)
      await this.grid.store(adminId, kind, next);
    return { grid: next };
  }
}

/** Xóa cả lưới của một loại tài khoản (lưới loại kia không bị ảnh hưởng). */
@Injectable()
export class ClearImportGridUseCase {
  constructor(
    @Inject(IMPORT_GRID_STORE) private readonly grid: IImportGridStore,
  ) {}

  async execute(adminId: string, kind: ImportKind): Promise<void> {
    await this.grid.clear(adminId, kind);
  }
}
