import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as argon2 from 'argon2';
import { DEFAULT_ROOT_ADMIN_NAME, ensureRootAdmin } from './root-admin';

const PASSWORD = 'Init#Pass-2026';

describe('ensureRootAdmin', () => {
  let db: any;

  beforeEach(() => {
    db = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    };
  });

  it('tạo Admin gốc: role ADMIN, LOCAL, buộc đổi mật khẩu, băm argon2, email chữ thường', async () => {
    const result = await ensureRootAdmin(db, {
      email: ' Root.Admin@Example.COM ',
      password: PASSWORD,
    });

    expect(result).toBe('CREATED');
    const data = db.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      email: 'root.admin@example.com',
      fullName: DEFAULT_ROOT_ADMIN_NAME,
      role: 'ADMIN',
      authProvider: 'LOCAL',
      mustChangePassword: true,
      isActive: true,
    });
    expect(data.passwordHash).not.toBe(PASSWORD);
    expect(await argon2.verify(data.passwordHash, PASSWORD)).toBe(true);
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'root.admin@example.com' },
    });
  });

  it('dùng họ tên tùy chọn khi có', async () => {
    await ensureRootAdmin(db, {
      email: 'a@example.com',
      password: PASSWORD,
      fullName: '  Admin APT ',
    });

    expect(db.user.create.mock.calls[0][0].data.fullName).toBe('Admin APT');
  });

  it('idempotent: email đã là ADMIN thì bỏ qua, không ghi đè và không cần mật khẩu', async () => {
    db.user.findUnique.mockResolvedValue({ role: 'ADMIN' });

    const result = await ensureRootAdmin(db, { email: 'a@example.com' });

    expect(result).toBe('ALREADY_EXISTS');
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('email đã tồn tại với vai trò khác ADMIN: dừng với lỗi, không tự nâng quyền', async () => {
    db.user.findUnique.mockResolvedValue({ role: 'TEACHER' });

    await expect(
      ensureRootAdmin(db, { email: 'a@example.com', password: PASSWORD }),
    ).rejects.toThrow(/không phải ADMIN/);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it.each([
    ['thiếu email', { password: PASSWORD }, /ROOT_ADMIN_EMAIL/],
    [
      'email sai định dạng',
      { email: 'khong-phai-email', password: PASSWORD },
      /định dạng/,
    ],
    ['thiếu mật khẩu', { email: 'a@example.com' }, /SEED_ADMIN_PASSWORD/],
    [
      'mật khẩu yếu',
      { email: 'a@example.com', password: 'abc12345' },
      /ít nhất 8 ký tự/,
    ],
  ])('từ chối khi %s', async (_name, input, message) => {
    await expect(ensureRootAdmin(db, input)).rejects.toThrow(message);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('thông báo lỗi không chứa mật khẩu', async () => {
    const error = await ensureRootAdmin(db, {
      email: 'a@example.com',
      password: 'weak',
    }).catch((e: Error) => e);

    expect((error as Error).message).not.toContain('weak');
  });
});
