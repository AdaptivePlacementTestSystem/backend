import { randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { AuthProviderType, UserRole, type PrismaClient } from '@prisma/client';

/** Mật khẩu mới phải đạt chính sách chung (BR-06, #134 D4): 8+ ký tự, chữ thường, chữ hoa, chữ số, ký tự đặc biệt. */
const PASSWORD_POLICY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const DEFAULT_ROOT_ADMIN_NAME = 'Quản trị viên hệ thống';

export interface RootAdminInput {
  email?: string;
  password?: string;
  fullName?: string;
}

export type RootAdminResult = 'CREATED' | 'ALREADY_EXISTS';

type RootAdminDb = Pick<PrismaClient, 'user'>;

/**
 * Tạo tài khoản Admin gốc (SRS 9b.4: Admin đầu tiên tạo bằng script cài đặt, trước các lô seed).
 * - Idempotent: email đã là ADMIN thì bỏ qua, không ghi đè mật khẩu hay họ tên.
 * - Email trùng nhưng không phải ADMIN thì dừng với lỗi (không tự nâng quyền).
 * - Tài khoản mới: authProvider LOCAL, `mustChangePassword = true` (đổi mật khẩu ở lần đăng nhập đầu).
 * - Mật khẩu chỉ lấy từ đầu vào (biến môi trường), không bao giờ ghi ra log.
 */
export async function ensureRootAdmin(
  db: RootAdminDb,
  input: RootAdminInput,
): Promise<RootAdminResult> {
  const email = input.email?.trim().toLowerCase();
  if (!email) throw new Error('Thiếu biến môi trường ROOT_ADMIN_EMAIL.');
  if (!EMAIL_REGEX.test(email)) {
    throw new Error('ROOT_ADMIN_EMAIL không đúng định dạng email.');
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role === UserRole.ADMIN) return 'ALREADY_EXISTS';
    throw new Error(
      `Email ${email} đã tồn tại với vai trò ${existing.role}, không phải ADMIN. Dùng email khác cho Admin gốc.`,
    );
  }

  const password = input.password;
  if (!password) throw new Error('Thiếu biến môi trường SEED_ADMIN_PASSWORD.');
  if (!PASSWORD_POLICY_REGEX.test(password)) {
    throw new Error(
      'SEED_ADMIN_PASSWORD phải có ít nhất 8 ký tự, gồm chữ thường, chữ hoa, chữ số và ký tự đặc biệt.',
    );
  }

  await db.user.create({
    data: {
      id: randomUUID(),
      email,
      fullName: input.fullName?.trim() || DEFAULT_ROOT_ADMIN_NAME,
      role: UserRole.ADMIN,
      authProvider: AuthProviderType.LOCAL,
      passwordHash: await argon2.hash(password),
      mustChangePassword: true,
      isActive: true,
    },
  });
  return 'CREATED';
}
