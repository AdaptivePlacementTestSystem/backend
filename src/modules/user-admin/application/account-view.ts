import { ConflictException } from '@nestjs/common';
import { ErrorCode } from '@apt/shared-types';
import type { AccountRecord } from '../../auth/domain/repositories/account.types';
import type { DuplicateField } from '../../auth/domain/errors/duplicate-account.error';

/** Dữ liệu trả về cho Admin; không bao giờ chứa mật khẩu hay mã băm. */
export interface AccountView {
  id: string;
  fullName: string;
  email: string;
  studentCode?: string;
  teacherCode?: string;
  isActive: boolean;
  /** `true` khi tài khoản chưa đổi mật khẩu tạm (cột "Đã đổi mật khẩu: Chưa"). */
  mustChangePassword: boolean;
  createdAt: Date;
}

export function toAccountView(record: AccountRecord): AccountView {
  const { user, profile } = record;
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    ...(profile.kind === 'STUDENT'
      ? { studentCode: profile.studentCode }
      : { teacherCode: profile.teacherCode }),
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

const DUPLICATE_MESSAGES: Record<DuplicateField, string> = {
  email: 'Email đã tồn tại.',
  studentCode: 'MSSV đã tồn tại.',
  teacherCode: 'Mã GV đã tồn tại.',
};

/** 409 CONFLICT kèm tên trường bị trùng để FE hiện lỗi dưới đúng ô nhập. */
export function duplicateConflict(field: DuplicateField): ConflictException {
  return new ConflictException({
    code: ErrorCode.CONFLICT,
    message: DUPLICATE_MESSAGES[field],
    details: { field },
  });
}
