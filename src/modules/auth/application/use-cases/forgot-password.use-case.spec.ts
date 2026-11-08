import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForgotPasswordUseCase } from './forgot-password.use-case';
import { UserRole } from '@prisma/client';

describe('ForgotPasswordUseCase', () => {
  let useCase: ForgotPasswordUseCase;
  let mockUserRepository: any;
  let mockOtpCacheRepository: any;
  let mockMailPort: any;

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: vi.fn(),
    };
    mockOtpCacheRepository = {
      saveOtp: vi.fn(),
    };
    mockMailPort = {
      sendPasswordResetOtp: vi.fn().mockResolvedValue(true),
    };
    useCase = new ForgotPasswordUseCase(
      mockUserRepository,
      mockOtpCacheRepository,
      mockMailPort,
    );
  });

  it('luôn trả về success: true dù email không tồn tại trong hệ thống (BR-14, SD_08)', async () => {
    mockUserRepository.findByEmail.mockResolvedValue(null);

    const res = await useCase.execute({ email: 'nonexistent@example.com' });

    expect(res).toEqual({ success: true });
    expect(mockOtpCacheRepository.saveOtp).not.toHaveBeenCalled();
    expect(mockMailPort.sendPasswordResetOtp).not.toHaveBeenCalled();
  });

  it('sinh mã OTP, lưu Redis và gửi email khi tài khoản tồn tại và đang hoạt động', async () => {
    mockUserRepository.findByEmail.mockResolvedValue({
      id: 'u-1',
      email: 'student@example.com',
      isActive: true,
      role: UserRole.STUDENT,
    });

    const res = await useCase.execute({ email: 'student@example.com' });

    expect(res).toEqual({ success: true });
    expect(mockOtpCacheRepository.saveOtp).toHaveBeenCalledWith(
      'student@example.com',
      expect.any(String),
      600,
    );
    expect(mockMailPort.sendPasswordResetOtp).toHaveBeenCalledWith(
      'student@example.com',
      expect.stringMatching(/^\d{6}$/),
    );
  });
});
