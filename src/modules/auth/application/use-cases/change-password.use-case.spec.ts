import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangePasswordUseCase } from './change-password.use-case';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

describe('ChangePasswordUseCase', () => {
  let useCase: ChangePasswordUseCase;
  let mockUserRepository: any;
  let mockPrisma: any;
  let mockJwtProvider: any;

  beforeEach(() => {
    mockUserRepository = {
      findById: vi.fn(),
    };
    mockPrisma = {
      user: {
        update: vi.fn(),
      },
    };
    mockJwtProvider = {
      generateToken: vi.fn().mockReturnValue('mock-new-token'),
    };
    useCase = new ChangePasswordUseCase(
      mockUserRepository,
      mockPrisma,
      mockJwtProvider,
    );
  });

  it('nên quăng UnauthorizedException nếu không tìm thấy user', async () => {
    mockUserRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute('user-1', {
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword123',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('nên quăng BadRequestException nếu mật khẩu hiện tại không đúng', async () => {
    const hash = await argon2.hash('OldPassword123');
    mockUserRepository.findById.mockResolvedValue({
      id: 'user-1',
      passwordHash: hash,
      email: 'test@example.com',
      role: UserRole.STUDENT,
    });

    await expect(
      useCase.execute('user-1', {
        currentPassword: 'WrongPassword',
        newPassword: 'NewPassword123',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('nên quăng BadRequestException nếu mật khẩu mới trùng mật khẩu cũ', async () => {
    const hash = await argon2.hash('SamePassword123');
    mockUserRepository.findById.mockResolvedValue({
      id: 'user-1',
      passwordHash: hash,
      email: 'test@example.com',
      role: UserRole.STUDENT,
    });

    await expect(
      useCase.execute('user-1', {
        currentPassword: 'SamePassword123',
        newPassword: 'SamePassword123',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('nên đổi mật khẩu thành công và cấp lại token mới', async () => {
    const hash = await argon2.hash('OldPassword123');
    mockUserRepository.findById.mockResolvedValue({
      id: 'user-1',
      passwordHash: hash,
      email: 'test@example.com',
      role: UserRole.STUDENT,
    });
    mockPrisma.user.update.mockResolvedValue({});

    const res = await useCase.execute('user-1', {
      currentPassword: 'OldPassword123',
      newPassword: 'NewPassword123',
    });

    expect(res).toEqual({ accessToken: 'mock-new-token' });
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          mustChangePassword: false,
        }),
      }),
    );
  });
});
