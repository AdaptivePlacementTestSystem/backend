import { UserEntity } from '../entities/user.entity';
import type { UserRole } from '../enums/user-role.enum';
import type {
  AccountChanges,
  AccountKind,
  AccountProfile,
  AccountQuery,
  AccountRecord,
  Paged,
} from './account.types';

export type RoleChangeResult =
  'UPDATED' | 'UNCHANGED' | 'NOT_FOUND' | 'INVALID_TARGET' | 'FORBIDDEN';

export interface IUserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findByExternalId(
    provider: string,
    externalId: string,
  ): Promise<UserEntity | null>;
  save(user: UserEntity): Promise<UserEntity>;
  /**
   * Cập nhật mật khẩu (đã băm) và đặt `passwordChangedAt = now`.
   * `mustChangePassword` mặc định false (đổi/đặt lại thành công).
   */
  updatePassword(
    userId: string,
    passwordHash: string,
    options?: { mustChangePassword?: boolean },
  ): Promise<void>;

  // ── Quản lý tài khoản SV/GV của Admin (F-22, UCADM09) ──

  findByStudentCode(studentCode: string): Promise<UserEntity | null>;
  findByTeacherCode(teacherCode: string): Promise<UserEntity | null>;

  /**
   * Tạo tài khoản và hồ sơ (MSSV/mã GV) trong cùng một lệnh ghi.
   * @throws DuplicateAccountError khi vi phạm ràng buộc duy nhất (đua ghi).
   */
  createAccount(
    user: UserEntity,
    profile: AccountProfile,
  ): Promise<AccountRecord>;

  /** Tìm tài khoản theo id và loại; không đúng loại thì trả null. */
  findAccountById(id: string, kind: AccountKind): Promise<AccountRecord | null>;

  findAccounts(query: AccountQuery): Promise<Paged<AccountRecord>>;

  /** @throws DuplicateAccountError khi email mới trùng tài khoản khác. */
  updateAccount(
    id: string,
    kind: AccountKind,
    changes: AccountChanges,
  ): Promise<AccountRecord>;

  /**
   * Tìm tài khoản theo id, không phân biệt role (SV, GV hay Admin).
   * Mã hồ sơ: SV → MSSV; GV và Admin → mã GV (có thể rỗng nếu Admin tạo bằng seed).
   */
  findAccountByUserId(id: string): Promise<AccountRecord | null>;

  /** Tập email (chữ thường) đã có trong hệ thống trong danh sách cho trước (kiểm trùng khi import). */
  findTakenEmails(emails: string[]): Promise<Set<string>>;

  /** Tập MSSV (SV) hoặc mã GV (GV) đã có trong danh sách cho trước. */
  findTakenCodes(kind: AccountKind, codes: string[]): Promise<Set<string>>;

  /**
   * Tạo nhiều tài khoản và hồ sơ trong MỘT transaction (BR-04: tất cả hoặc không có gì).
   * @throws DuplicateAccountError khi vi phạm ràng buộc duy nhất (đua ghi); không tạo tài khoản nào.
   */
  createAccounts(
    items: ReadonlyArray<{ user: UserEntity; profile: AccountProfile }>,
  ): Promise<void>;

  /** Khóa/mở khóa: ghi `isActive`; `JwtStrategy` đọc DB mỗi request nên có hiệu lực ngay. */
  setActiveAtomically(
    actorId: string,
    targetId: string,
    isActive: boolean,
  ): Promise<RoleChangeResult>;

  /** Kiểm quyền và thay role nguyên tử để không mất Admin cuối khi thao tác đồng thời. */
  changeRoleAtomically(
    actorId: string,
    targetId: string,
    role: UserRole,
  ): Promise<RoleChangeResult>;
}
