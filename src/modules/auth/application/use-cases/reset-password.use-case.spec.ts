import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResetPasswordUseCase } from './reset-password.use-case';
import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('ResetPasswordUseCase', () => {
  let useCase: ResetPasswordUseCase;
  let mockUserRepository: any;
  let mockOtpCacheRepository: any;
  let mockPrisma: any;

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: vi.fn(),
    };
    mockOtpCacheRepository = {
      getOtp: vi.fn(),
      incrementAttempts: vi.fn(),
      deleteOtp: vi.fn(),
    };
    mockPrisma = {
      user: {
        update: vi.fn(),
      },
    };
    useCase = new ResetPasswordUseCase(
      mockUserRepository,
      mockOtpCacheRepository,
      mockPrisma,
    );
  });

  it('nên quăng BadRequestException nếu OTP không tồn tại hoặc đã hết hạn', async () => {
    mockOtpCacheRepository.getOtp.mockResolvedValue(null);

    await expect(
      useCase.execute({
        email: 'test@example.com',
        otp: '123456',
        newPassword: 'NewPassword123',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('nên quăng BadRequestException nếu OTP sai và tăng bộ đếm', async () => {
    const validOtp = '654321';
    const validHash = crypto
      .createHash('sha256')
      .update(validOtp)
      .digest('hex');
    mockOtpCacheRepository.getOtp.mockResolvedValue({
      hash: validHash,
      attempts: 1,
    });
    mockOtpCacheRepository.incrementAttempts.mockResolvedValue(2);

    await expect(
      useCase.execute({
        email: 'test@example.com',
        otp: '111111',
        newPassword: 'NewPassword123',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockOtpCacheRepository.incrementAttempts).toHaveBeenCalledWith(
      'test@example.com',
    );
  });

  it('nên hủy mã nếu số lần nhập sai đạt ngưỡng 5', async () => {
    const validOtp = '654321';
    const validHash = crypto
      .createHash('sha256')
      .update(validOtp)
      .digest('hex');
    mockOtpCacheRepository.getOtp.mockResolvedValue({
      hash: validHash,
      attempts: 4,
    });
    mockOtpCacheRepository.incrementAttempts.mockResolvedValue(5);

    await expect(
      useCase.execute({
        email: 'test@example.com',
        otp: '111111',
        newPassword: 'NewPassword123',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockOtpCacheRepository.deleteOtp).toHaveBeenCalledWith(
      'test@example.com',
    );
  });

  it('đặt lại mật khẩu thành công khi OTP chính xác', async () => {
    const validOtp = '123456';
    const validHash = crypto
      .createHash('sha256')
      .update(validOtp)
      .digest('hex');
    mockOtpCacheRepository.getOtp.mockResolvedValue({
      hash: validHash,
      attempts: 0,
    });
    mockUserRepository.findByEmail.mockResolvedValue({
      id: 'u-1',
      email: 'test@example.com',
    });
    mockPrisma.user.update.mockResolvedValue({});

    const res = await useCase.execute({
      email: 'test@example.com',
      otp: validOtp,
      newPassword: 'NewPassword123',
    });

    expect(res).toEqual({ success: true });
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: expect.objectContaining({
          mustChangePassword: false,
        }),
      }),
    );
    expect(mockOtpCacheRepository.deleteOtp).toHaveBeenCalledWith(
      'test@example.com',
    );
  });
});
