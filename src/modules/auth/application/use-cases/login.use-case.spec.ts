import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { LoginUseCase } from './login.use-case';

describe('LoginUseCase', () => {
  let useCase: LoginUseCase;
  let userRepository: any;
  let jwtProvider: any;
  let user: any;

  beforeEach(async () => {
    user = {
      id: 'u-1',
      email: 'a@b.com',
      fullName: 'Nguyễn Văn A',
      role: 'STUDENT',
      isActive: true,
      mustChangePassword: true,
      passwordHash: await argon2.hash('Right@Pass1'),
    };
    userRepository = { findByEmail: vi.fn().mockResolvedValue(user) };
    jwtProvider = { generateToken: vi.fn().mockReturnValue('jwt-token') };
    useCase = new LoginUseCase(userRepository, jwtProvider);
  });

  it('đăng nhập đúng: trả token và cờ mustChangePassword', async () => {
    const res = await useCase.execute({
      email: ' A@B.com ',
      password: 'Right@Pass1',
    });

    expect(userRepository.findByEmail).toHaveBeenCalledWith('a@b.com');
    expect(res.accessToken).toBe('jwt-token');
    expect(res.user.mustChangePassword).toBe(true);
    expect(JSON.stringify(res)).not.toContain('passwordHash');
  });

  it('email không tồn tại và mật khẩu sai trả cùng một lỗi (không lộ email)', async () => {
    userRepository.findByEmail.mockResolvedValueOnce(null);
    const noUser = await useCase
      .execute({ email: 'x@y.com', password: 'whatever' })
      .catch((e) => e);
    const wrongPw = await useCase
      .execute({ email: 'a@b.com', password: 'wrong' })
      .catch((e) => e);

    expect(noUser).toBeInstanceOf(UnauthorizedException);
    expect(wrongPw).toBeInstanceOf(UnauthorizedException);
    expect(noUser.getResponse()).toEqual(wrongPw.getResponse());
  });

  it('tài khoản bị khóa: 403', async () => {
    user.isActive = false;
    await expect(
      useCase.execute({ email: 'a@b.com', password: 'Right@Pass1' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('hash lưu hỏng: coi như sai mật khẩu, không ném lỗi hệ thống', async () => {
    user.passwordHash = 'not-an-argon2-hash';
    await expect(
      useCase.execute({ email: 'a@b.com', password: 'Right@Pass1' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
