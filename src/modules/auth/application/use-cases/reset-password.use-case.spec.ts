import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  ResetPasswordUseCase,
  MAX_OTP_ATTEMPTS,
} from './reset-password.use-case';

const OTP = '654321';
const OTP_HASH = crypto.createHash('sha256').update(OTP).digest('hex');
const NEW_PASSWORD = 'NewPass@123';

describe('ResetPasswordUseCase', () => {
  let useCase: ResetPasswordUseCase;
  let userRepository: any;
  let otpCache: any;

  const dto = (otp = OTP) => ({
    email: 'Test@Example.com ',
    otp,
    newPassword: NEW_PASSWORD,
  });

  beforeEach(() => {
    userRepository = {
      findByEmail: vi.fn(),
      updatePassword: vi.fn().mockResolvedValue(undefined),
    };
    otpCache = {
      getOtp: vi.fn().mockResolvedValue({ hash: OTP_HASH, attempts: 0 }),
      incrementAttempts: vi.fn().mockResolvedValue(1),
      deleteOtp: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new ResetPasswordUseCase(userRepository, otpCache);
  });

  it('từ chối nếu OTP không tồn tại hoặc đã hết hạn', async () => {
    otpCache.getOtp.mockResolvedValue(null);

    await expect(useCase.execute(dto())).rejects.toThrow(BadRequestException);
    expect(otpCache.incrementAttempts).not.toHaveBeenCalled();
  });

  it('OTP sai: tăng bộ đếm, báo lỗi, không đổi mật khẩu và không hủy OTP', async () => {
    otpCache.incrementAttempts.mockResolvedValue(2);

    await expect(useCase.execute(dto('000000'))).rejects.toThrow(
      'Mã xác thực không chính xác',
    );
    expect(otpCache.incrementAttempts).toHaveBeenCalledWith('test@example.com');
    expect(userRepository.updatePassword).not.toHaveBeenCalled();
    expect(otpCache.deleteOtp).not.toHaveBeenCalled();
  });

  it('lần sai thứ 5: hủy OTP', async () => {
    otpCache.incrementAttempts.mockResolvedValue(MAX_OTP_ATTEMPTS);

    await expect(useCase.execute(dto('000000'))).rejects.toThrow(/quá 5 lần/);
    expect(otpCache.deleteOtp).toHaveBeenCalledWith('test@example.com');
  });

  it('vượt quá số lần thử: từ chối cả khi OTP đúng (request song song không lách được giới hạn)', async () => {
    otpCache.incrementAttempts.mockResolvedValue(MAX_OTP_ATTEMPTS + 1);

    await expect(useCase.execute(dto(OTP))).rejects.toThrow(/quá 5 lần/);
    expect(userRepository.findByEmail).not.toHaveBeenCalled();
    expect(userRepository.updatePassword).not.toHaveBeenCalled();
    expect(otpCache.deleteOtp).toHaveBeenCalled();
  });

  it('hash lưu hỏng (không phải hex 64 ký tự): coi như sai, không ném lỗi hệ thống', async () => {
    otpCache.getOtp.mockResolvedValue({ hash: 'not-a-hash', attempts: 0 });

    await expect(useCase.execute(dto())).rejects.toThrow(BadRequestException);
    expect(userRepository.updatePassword).not.toHaveBeenCalled();
  });

  it('từ chối và hủy OTP nếu tài khoản không tồn tại', async () => {
    userRepository.findByEmail.mockResolvedValue(null);

    await expect(useCase.execute(dto())).rejects.toThrow(BadRequestException);
    expect(otpCache.deleteOtp).toHaveBeenCalledWith('test@example.com');
    expect(userRepository.updatePassword).not.toHaveBeenCalled();
  });

  it('từ chối nếu tài khoản bị khóa dù OTP đúng', async () => {
    userRepository.findByEmail.mockResolvedValue({
      id: 'u-1',
      isActive: false,
    });

    await expect(useCase.execute(dto())).rejects.toThrow(BadRequestException);
    expect(userRepository.updatePassword).not.toHaveBeenCalled();
  });

  it('OTP đúng: băm argon2, lưu qua repository và xóa OTP', async () => {
    userRepository.findByEmail.mockResolvedValue({ id: 'u-1', isActive: true });

    const res = await useCase.execute(dto());

    expect(res).toEqual({ success: true });
    expect(userRepository.updatePassword).toHaveBeenCalledTimes(1);
    const [userId, hash] = userRepository.updatePassword.mock.calls[0];
    expect(userId).toBe('u-1');
    expect(hash).toMatch(/^\$argon2/);
    expect(hash).not.toContain(NEW_PASSWORD);
    expect(otpCache.deleteOtp).toHaveBeenCalledWith('test@example.com');
  });
});
