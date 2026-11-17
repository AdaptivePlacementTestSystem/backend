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

    // BR-14, SD_08: luôn phản hồi giống nhau (202) dù email có tồn tại hay không,
    // và dù Redis/SMTP có lỗi (D5, DECISIONS_LOG #134) — chỉ ghi log.
    try {
      const user = await this.userRepository.findByEmail(normalizedEmail);

      if (user && user.isActive) {
        // 1. OTP 6 chữ số ngẫu nhiên an toàn
        const otp = crypto.randomInt(100000, 1000000).toString();
        // 2. Chỉ lưu SHA-256 của OTP trong Redis
        const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
        // 3. TTL 10 phút, attempts = 0
        await this.otpCacheRepository.saveOtp(normalizedEmail, otpHash, 600);
        // 4. Gửi mail ngay trong request (D6); lỗi gửi mail được ném và bắt ở dưới
        await this.mailPort.sendPasswordResetOtp(user.email, otp);
      } else {
        this.logger.log(
          'Yêu cầu quên mật khẩu cho email không tồn tại hoặc tài khoản bị khóa',
        );
      }
    } catch (err) {
      this.logger.error(
        `Lỗi xử lý quên mật khẩu: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }

    return { success: true };
  }
}
