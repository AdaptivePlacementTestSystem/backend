import type {
  ImportJob,
  ImportKind,
  ImportRow,
  RawImportRow,
} from './import.types';

/** Lưới tạm trong Redis, khóa theo (adminId, kind); mỗi lần ghi làm mới TTL. */
export interface IImportGridStore {
  /** `null` khi chưa có hoặc đã hết TTL; mảng rỗng khi lưới tồn tại nhưng không còn dòng. */
  load(adminId: string, kind: ImportKind): Promise<ImportRow[] | null>;
  store(adminId: string, kind: ImportKind, rows: ImportRow[]): Promise<void>;
  clear(adminId: string, kind: ImportKind): Promise<void>;
}
export const IMPORT_GRID_STORE = 'IImportGridStore';

/** Trạng thái tác vụ Lưu nền. `tryAcquire` bảo đảm mỗi (admin, kind) chỉ có một tác vụ chạy tại một thời điểm. */
export interface IImportJobStore {
  get(adminId: string, kind: ImportKind): Promise<ImportJob | null>;
  set(adminId: string, kind: ImportKind, job: ImportJob): Promise<void>;
  tryAcquire(adminId: string, kind: ImportKind): Promise<boolean>;
  release(adminId: string, kind: ImportKind): Promise<void>;
}
export const IMPORT_JOB_STORE = 'IImportJobStore';

/** Đọc file .xlsx import và dựng file mẫu. Lỗi file ném `ImportFileError`. */
export interface IAccountSpreadsheet {
  read(buffer: Buffer, kind: ImportKind): Promise<RawImportRow[]>;
  buildTemplate(kind: ImportKind): Promise<Buffer>;
}
export const ACCOUNT_SPREADSHEET = 'IAccountSpreadsheet';
