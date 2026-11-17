import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ResendTemporaryPasswordUseCase } from './resend-temporary-password.use-case';
import { UserEntity } from '../../../auth/domain/entities/user.entity';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';

const NEW_PASSWORD = 'New#Temp-99x';

const record = (role: UserRole, mustChangePassword = false) => ({
  user: new UserEntity(
    'target',
    'x@example.com',
    'Nguyễn Văn A',
    role,
    'old-hash',
    null,
    null,
    mustChangePassword,
    true,
  ),
  profile:
    role === UserRole.STUDENT
      ? { kind: 'STUDENT' as const, studentCode: '20110001' }
      : { kind: 'TEACHER' as const, teacherCode: 'GV1' },
});

describe('ResendTemporaryPasswordUseCase', () => {
  let useCase: ResendTemporaryPasswordUseCase;
  let repo: any;
  let generator: any;
  let mail: any;

  beforeEach(() => {
    repo = {
      findAccountByUserId: vi.fn().mockResolvedValue(record(UserRole.STUDENT)),
      updatePassword: vi.fn().mockResolvedValue(undefined),
    };
    generator = { generate: vi.fn().mockReturnValue(NEW_PASSWORD) };
    mail = { sendTemporaryPassword: vi.fn().mockResolvedValue(true) };
    useCase = new ResendTemporaryPasswordUseCase(repo, generator, mail);
  });

  it('sinh mật khẩu mới, băm argon2, buộc đổi lại và gửi email kèm MSSV', async () => {
    await useCase.execute('target');

    const [id, hash, options] = repo.updatePassword.mock.calls[0];
    expect(id).toBe('target');
    expect(hash).not.toBe(NEW_PASSWORD);
    expect(await argon2.verify(hash, NEW_PASSWORD)).toBe(true);
    expect(options).toEqual({ mustChangePassword: true });
    expect(mail.sendTemporaryPassword).toHaveBeenCalledWith(
      'x@example.com',
      'Nguyễn Văn A',
      NEW_PASSWORD,
      '20110001',
    );
  });

  it('cho phép với tài khoản đã đổi mật khẩu (mustChangePassword = false)', async () => {
    repo.findAccountByUserId.mockResolvedValue(record(UserRole.STUDENT, false));

    await expect(useCase.execute('target')).resolves.toBeDefined();
    expect(repo.updatePassword).toHaveBeenCalledTimes(1);
  });

  it('giảng viên: gửi email không kèm MSSV', async () => {
    repo.findAccountByUserId.mockResolvedValue(record(UserRole.TEACHER));

    await useCase.execute('target');

    expect(mail.sendTemporaryPassword).toHaveBeenCalledWith(
      'x@example.com',
      'Nguyễn Văn A',
      NEW_PASSWORD,
      undefined,
    );
  });

  it('không áp dụng cho tài khoản Admin: 403, không đổi mật khẩu', async () => {
    repo.findAccountByUserId.mockResolvedValue(record(UserRole.ADMIN));

    await expect(useCase.execute('target')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.updatePassword).not.toHaveBeenCalled();
    expect(mail.sendTemporaryPassword).not.toHaveBeenCalled();
  });

  it('không tìm thấy tài khoản: 404', async () => {
    repo.findAccountByUserId.mockResolvedValue(null);

    await expect(useCase.execute('none')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('gửi email lỗi: mật khẩu vẫn được đặt lại, không ném ra ngoài', async () => {
    mail.sendTemporaryPassword.mockRejectedValue(new Error('SMTP down'));

    await expect(useCase.execute('target')).resolves.toBeDefined();
    expect(repo.updatePassword).toHaveBeenCalledTimes(1);
  });

  it('kết quả trả về không chứa mật khẩu hay mã băm', async () => {
    const json = JSON.stringify(await useCase.execute('target'));

    expect(json).not.toContain(NEW_PASSWORD);
    expect(json).not.toContain('old-hash');
    expect(json).not.toContain('passwordHash');
  });
});
