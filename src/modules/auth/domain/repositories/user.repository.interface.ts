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

  /** Khóa/mở khóa: ghi `isActive`; `JwtStrategy` đọc DB mỗi request nên có hiệu lực ngay. */
  setActive(id: string, isActive: boolean): Promise<void>;

  /** Đổi role (nâng/thu hồi Admin); có hiệu lực ngay vì role đọc từ DB mỗi request. */
  updateRole(id: string, role: UserRole): Promise<void>;
}
