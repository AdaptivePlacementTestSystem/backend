import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import type { IUserRepository } from '../../domain/repositories/user.repository.interface';
import type { IOtpCacheRepository } from '../../domain/repositories/otp-cache.repository.interface';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { ErrorCode } from '@apt/shared-types';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

/** Số lần nhập OTP tối đa (kể cả lần đúng) trước khi hủy mã. */
export const MAX_OTP_ATTEMPTS = 5;

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
    @Inject('IOtpCacheRepository')
    private readonly otpCacheRepository: IOtpCacheRepository,
  ) {}

  async execute(dto: ResetPasswordDto): Promise<{ success: boolean }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Lấy OTP trong Redis (SD_08, BR-14)
    const otpRecord = await this.otpCacheRepository.getOtp(normalizedEmail);
    if (!otpRecord) {
      throw this.invalidOtp('Mã xác thực không đúng hoặc đã hết hạn');
    }

    // 2. Tăng bộ đếm NGUYÊN TỬ trước khi so khớp: request song song không thể
    //    vượt quá MAX_OTP_ATTEMPTS lần thử.
    const attempts =
      await this.otpCacheRepository.incrementAttempts(normalizedEmail);
    if (attempts > MAX_OTP_ATTEMPTS) {
      await this.otpCacheRepository.deleteOtp(normalizedEmail);
      throw this.invalidOtp(
        `Bạn đã nhập sai mã xác thực quá ${MAX_OTP_ATTEMPTS} lần. Mã đã bị hủy.`,
      );
    }

    // 3. So khớp hash trong thời gian không đổi
    if (!this.hashMatches(dto.otp.trim(), otpRecord.hash)) {
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await this.otpCacheRepository.deleteOtp(normalizedEmail);
        throw this.invalidOtp(
          `Bạn đã nhập sai mã xác thực quá ${MAX_OTP_ATTEMPTS} lần. Mã đã bị hủy.`,
        );
      }
      throw this.invalidOtp('Mã xác thực không chính xác');
    }

    // 4. Tài khoản phải tồn tại và còn hoạt động (không tiết lộ lý do cụ thể)
    const user = await this.userRepository.findByEmail(normalizedEmail);
    if (!user || !user.isActive) {
      await this.otpCacheRepository.deleteOtp(normalizedEmail);
      throw this.invalidOtp('Mã xác thực không đúng hoặc đã hết hạn');
    }

    // 5. Băm argon2 (#62), lưu qua repository (mustChangePassword = false)
    const passwordHash = await argon2.hash(dto.newPassword);
    await this.userRepository.updatePassword(user.id, passwordHash);

    // 6. OTP dùng một lần
    await this.otpCacheRepository.deleteOtp(normalizedEmail);

    return { success: true };
  }

  private hashMatches(otp: string, storedHash: string): boolean {
    const inputHash = crypto.createHash('sha256').update(otp).digest();
    const stored = Buffer.from(storedHash, 'hex');
    return (
      stored.length === inputHash.length &&
      crypto.timingSafeEqual(inputHash, stored)
    );
  }

  private invalidOtp(message: string): BadRequestException {
    return new BadRequestException({
      code: ErrorCode.INVALID_RESET_OTP,
      message,
    });
  }
}
