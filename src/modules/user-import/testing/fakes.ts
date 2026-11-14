import * as ExcelJS from 'exceljs';
import type {
  IAccountSpreadsheet,
  IImportGridStore,
  IImportJobStore,
} from '../domain/ports';
import type {
  ImportJob,
  ImportKind,
  ImportRow,
  RawImportRow,
} from '../domain/import.types';

/** Bản giả trong bộ nhớ của lưới tạm (dùng cho test; không có TTL thật). */
export class FakeGridStore implements IImportGridStore {
  readonly data = new Map<string, ImportRow[]>();
  private k = (adminId: string, kind: ImportKind) => `${adminId}:${kind}`;
  load(adminId: string, kind: ImportKind) {
    return Promise.resolve(this.data.get(this.k(adminId, kind)) ?? null);
  }
  store(adminId: string, kind: ImportKind, rows: ImportRow[]) {
    this.data.set(this.k(adminId, kind), [...rows]);
    return Promise.resolve();
  }
  clear(adminId: string, kind: ImportKind) {
    this.data.delete(this.k(adminId, kind));
    return Promise.resolve();
  }
}

export class FakeJobStore implements IImportJobStore {
  readonly jobs = new Map<string, ImportJob>();
  readonly locks = new Set<string>();
  readonly history: ImportJob[] = [];
  private k = (adminId: string, kind: ImportKind) => `${adminId}:${kind}`;
  get(adminId: string, kind: ImportKind) {
    return Promise.resolve(this.jobs.get(this.k(adminId, kind)) ?? null);
  }
  set(adminId: string, kind: ImportKind, job: ImportJob) {
    this.jobs.set(this.k(adminId, kind), job);
    this.history.push(job);
    return Promise.resolve();
  }
  tryAcquire(adminId: string, kind: ImportKind) {
    const key = this.k(adminId, kind);
    if (this.locks.has(key)) return Promise.resolve(false);
    this.locks.add(key);
    return Promise.resolve(true);
  }
  release(adminId: string, kind: ImportKind) {
    this.locks.delete(this.k(adminId, kind));
    return Promise.resolve();
  }
}

/** Bộ đọc giả trả về đúng các dòng thô cho trước (kiểm logic gộp/kiểm tra mà không cần file thật). */
export class FakeSpreadsheet implements IAccountSpreadsheet {
  rows: RawImportRow[] = [];
  read() {
    return Promise.resolve(this.rows);
  }
  buildTemplate() {
    return Promise.resolve(Buffer.from('template'));
  }
}

/** Dựng nhanh một file .xlsx thật trong bộ nhớ để test bộ đọc exceljs. */
export async function makeXlsx(
  table: Array<Array<string | number | null>>,
  sheetName = 'Danh sách',
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  table.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
