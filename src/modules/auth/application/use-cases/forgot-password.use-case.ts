import { Injectable, Inject, Logger } from '@nestjs/common';
import type { IUserRepository } from '../../domain/repositories/user.repository.interface';
import type { IOtpCacheRepository } from '../../domain/repositories/otp-cache.repository.interface';
import type { IMailPort } from '../../../mail/domain/ports/mail.port';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import * as crypto from 'crypto';

@Injectable()
export class ForgotPasswordUseCase {
  private readonly logger = new Logger(ForgotPasswordUseCase.name);

  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
    @Inject('IOtpCacheRepository')
    private readonly otpCacheRepository: IOtpCacheRepository,
    @Inject('IMailPort')
    private readonly mailPort: IMailPort,
  ) {}

  async execute(dto: ForgotPasswordDto): Promise<{ success: boolean }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Tìm user theo email
    const user = await this.userRepository.findByEmail(normalizedEmail);

    // BR-14, SD_08: Phản hồi luôn 202 (không làm lộ email tồn tại trong hệ thống)
    if (user && user.isActive) {
      // 1. Sinh OTP 6 chữ số ngẫu nhiên an toàn (crypto.randomInt)
      const otp = crypto.randomInt(100000, 1000000).toString();

      // 2. Băm OTP bằng SHA-256 để lưu Redis
      const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

      // 3. Lưu vào Redis, TTL 10 phút (600s), attempts = 0
      await this.otpCacheRepository.saveOtp(normalizedEmail, otpHash, 600);

      // 4. Gửi email chứa OTP cho người dùng
      try {
        await this.mailPort.sendPasswordResetOtp(user.email, otp);
      } catch (err) {
        this.logger.error(
          `Lỗi khi gửi email OTP tới ${user.email}: ${(err as Error).message}`,
        );
      }
    } else {
      this.logger.log(
        `Yêu cầu quên mật khẩu cho email không tồn tại hoặc tài khoản bị khóa: ${normalizedEmail}`,
      );
    }

    return { success: true };
  }
}
