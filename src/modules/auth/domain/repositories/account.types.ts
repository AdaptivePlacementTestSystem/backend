import { UserEntity } from '../entities/user.entity';

/** Loại tài khoản do Admin quản lý (ứng với role STUDENT / TEACHER). */
export type AccountKind = 'STUDENT' | 'TEACHER';

/** Hồ sơ đi kèm tài khoản: MSSV (sinh viên) hoặc mã giảng viên (giảng viên). */
export type AccountProfile =
  | { kind: 'STUDENT'; studentCode: string }
  | { kind: 'TEACHER'; teacherCode: string };

/** Tài khoản kèm mã hồ sơ (MSSV hoặc mã GV). */
export interface AccountRecord {
  user: UserEntity;
  profile: AccountProfile;
}

export interface AccountQuery {
  kind: AccountKind;
  /** Tìm theo email, họ tên hoặc MSSV/mã GV (không phân biệt hoa thường). */
  q?: string;
  page: number;
  pageSize: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AccountChanges {
  fullName?: string;
  email?: string;
}
