import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole } from '@prisma/client';
import { ForgotPasswordUseCase } from './forgot-password.use-case';

describe('ForgotPasswordUseCase', () => {
  let useCase: ForgotPasswordUseCase;
  let userRepository: any;
  let otpCache: any;
  let mailPort: any;

  const activeUser = {
    id: 'u-1',
    email: 'student@example.com',
    isActive: true,
    role: UserRole.STUDENT,
  };

  beforeEach(() => {
    userRepository = { findByEmail: vi.fn() };
    otpCache = { saveOtp: vi.fn().mockResolvedValue(undefined) };
    mailPort = { sendPasswordResetOtp: vi.fn().mockResolvedValue(true) };
    useCase = new ForgotPasswordUseCase(userRepository, otpCache, mailPort);
  });

  it('luôn trả success dù email không tồn tại (BR-14, SD_08)', async () => {
    userRepository.findByEmail.mockResolvedValue(null);

    const res = await useCase.execute({ email: 'nonexistent@example.com' });

    expect(res).toEqual({ success: true });
    expect(otpCache.saveOtp).not.toHaveBeenCalled();
    expect(mailPort.sendPasswordResetOtp).not.toHaveBeenCalled();
  });

  it('không gửi OTP cho tài khoản bị khóa nhưng vẫn trả success', async () => {
    userRepository.findByEmail.mockResolvedValue({
      ...activeUser,
      isActive: false,
    });

    const res = await useCase.execute({ email: 'student@example.com' });

    expect(res).toEqual({ success: true });
    expect(mailPort.sendPasswordResetOtp).not.toHaveBeenCalled();
  });

  it('sinh OTP, chỉ lưu hash vào Redis và gửi email khi tài khoản hợp lệ', async () => {
    userRepository.findByEmail.mockResolvedValue(activeUser);

    const res = await useCase.execute({ email: ' Student@Example.com ' });

    expect(res).toEqual({ success: true });
    const [email, hash, ttl] = otpCache.saveOtp.mock.calls[0];
    expect(email).toBe('student@example.com');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ttl).toBe(600);
    const [, sentOtp] = mailPort.sendPasswordResetOtp.mock.calls[0];
    expect(sentOtp).toMatch(/^\d{6}$/);
    expect(hash).not.toContain(sentOtp);
  });

  it('Redis lỗi: vẫn trả success (không lộ trạng thái hạ tầng) và không gửi mail', async () => {
    userRepository.findByEmail.mockResolvedValue(activeUser);
    otpCache.saveOtp.mockRejectedValue(new Error('redis down'));

    const res = await useCase.execute({ email: 'student@example.com' });

    expect(res).toEqual({ success: true });
    expect(mailPort.sendPasswordResetOtp).not.toHaveBeenCalled();
  });

  it('SMTP lỗi: vẫn trả success', async () => {
    userRepository.findByEmail.mockResolvedValue(activeUser);
    mailPort.sendPasswordResetOtp.mockRejectedValue(new Error('smtp down'));

    await expect(
      useCase.execute({ email: 'student@example.com' }),
    ).resolves.toEqual({ success: true });
  });

  it('DB lỗi khi tìm user: vẫn trả success', async () => {
    userRepository.findByEmail.mockRejectedValue(new Error('db down'));

    await expect(
      useCase.execute({ email: 'student@example.com' }),
    ).resolves.toEqual({ success: true });
  });
});
