import type { AccountKind } from '../../auth/domain/repositories/account.types';

export type ImportKind = AccountKind;

/** Một dòng đã hợp lệ trong lưới tạm (chưa ghi DB). `rowKey` để xóa từng dòng. */
export interface ImportRow {
  rowKey: string;
  /** MSSV (kind = STUDENT) hoặc Mã GV (kind = TEACHER). */
  code: string;
  fullName: string;
  /** Email chữ thường. */
  email: string;
}

/** Dòng đọc thô từ file (đã cắt khoảng trắng); `row` là số dòng trong file Excel. */
export interface RawImportRow {
  row: number;
  code: string;
  fullName: string;
  email: string;
}

export type RejectReasonCode =
  'MISSING_FIELD' | 'INVALID_EMAIL' | 'DUPLICATE_IN_FILE';

/** Dòng bị loại vì không hợp lệ (popup "dòng bị loại"). */
export interface RejectedRow {
  row: number;
  code: RejectReasonCode;
  reason: string;
}

/** Dòng trùng với tài khoản đã có trong hệ thống (popup "Tài khoản đã tồn tại"); không vào lưới, không chặn Lưu. */
export interface ExistingRow {
  row: number;
  field: 'email' | 'code';
  value: string;
}

export interface UploadResult {
  grid: ImportRow[];
  rejected: RejectedRow[];
  existing: ExistingRow[];
  /** Số dòng mới thêm vào lưới từ file này. */
  added: number;
  /** Số dòng đã có sẵn trong lưới nên bỏ qua (tải thêm file trùng). */
  ignoredDuplicates: number;
}

export type ImportJobStatus = 'PROCESSING' | 'DONE' | 'FAILED';

/** Trạng thái tác vụ Lưu chạy nền (Redis). Không chứa mật khẩu. */
export interface ImportJob {
  status: ImportJobStatus;
  total: number;
  /** Số tài khoản đã băm mật khẩu xong (tiến độ). */
  processed: number;
  created?: number;
  queued?: number;
  /** Chỉ khi FAILED. */
  error?: {
    code: 'CONFLICT' | 'UNKNOWN';
    message: string;
    conflicts?: ExistingRow[];
  };
  startedAt: string;
  finishedAt?: string;
}
