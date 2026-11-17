import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { ChangePasswordUseCase } from './change-password.use-case';

describe('ChangePasswordUseCase', () => {
  let useCase: ChangePasswordUseCase;
  let userRepository: any;
  let jwtProvider: any;

  beforeEach(() => {
    userRepository = {
      findById: vi.fn(),
      updatePassword: vi.fn().mockResolvedValue(undefined),
    };
    jwtProvider = { generateToken: vi.fn().mockReturnValue('mock-new-token') };
    useCase = new ChangePasswordUseCase(userRepository, jwtProvider);
  });

  const userWith = async (password: string) => ({
    id: 'user-1',
    email: 'test@example.com',
    role: UserRole.STUDENT,
    passwordHash: await argon2.hash(password),
  });

  it('quăng UnauthorizedException nếu không tìm thấy user', async () => {
    userRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute('user-1', {
        currentPassword: 'Old@Password1',
        newPassword: 'New@Password1',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('quăng BadRequestException nếu mật khẩu hiện tại không đúng', async () => {
    userRepository.findById.mockResolvedValue(await userWith('Old@Password1'));

    await expect(
      useCase.execute('user-1', {
        currentPassword: 'Wrong@Password1',
        newPassword: 'New@Password1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(userRepository.updatePassword).not.toHaveBeenCalled();
  });

  it('quăng BadRequestException nếu mật khẩu mới trùng mật khẩu cũ', async () => {
    userRepository.findById.mockResolvedValue(await userWith('Old@Password1'));

    await expect(
      useCase.execute('user-1', {
        currentPassword: 'Old@Password1',
        newPassword: 'Old@Password1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(userRepository.updatePassword).not.toHaveBeenCalled();
  });

  it('đổi thành công: lưu hash argon2 qua repository và cấp token mới', async () => {
    userRepository.findById.mockResolvedValue(await userWith('Old@Password1'));

    const res = await useCase.execute('user-1', {
      currentPassword: 'Old@Password1',
      newPassword: 'New@Password1',
    });

    expect(res).toEqual({ accessToken: 'mock-new-token' });
    const [userId, hash] = userRepository.updatePassword.mock.calls[0];
    expect(userId).toBe('user-1');
    expect(await argon2.verify(hash, 'New@Password1')).toBe(true);
    expect(jwtProvider.generateToken).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'test@example.com',
      role: UserRole.STUDENT,
    });
  });
});
