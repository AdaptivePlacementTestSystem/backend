import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import type { IUserRepository } from '../../domain/repositories/user.repository.interface';
import type { IOtpCacheRepository } from '../../domain/repositories/otp-cache.repository.interface';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { ErrorCode } from '@apt/shared-types';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
    @Inject('IOtpCacheRepository')
    private readonly otpCacheRepository: IOtpCacheRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(dto: ResetPasswordDto): Promise<{ success: boolean }> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Lấy thông tin OTP trong Redis (SD_08, BR-14)
    const otpRecord = await this.otpCacheRepository.getOtp(normalizedEmail);
    if (!otpRecord) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_RESET_OTP,
        message: 'Mã xác thực không đúng hoặc đã hết hạn',
      });
    }

    // 2. Kiểm tra số lần nhập sai (tối đa 5 lần)
    if (otpRecord.attempts >= 5) {
      await this.otpCacheRepository.deleteOtp(normalizedEmail);
      throw new BadRequestException({
        code: ErrorCode.INVALID_RESET_OTP,
        message: 'Bạn đã nhập sai mã xác thực quá 5 lần. Mã đã bị hủy.',
      });
    }

    // 3. So khớp hash của mã OTP
    const inputHash = crypto
      .createHash('sha256')
      .update(dto.otp.trim())
      .digest('hex');
    if (inputHash !== otpRecord.hash) {
      const currentAttempts =
        await this.otpCacheRepository.incrementAttempts(normalizedEmail);
      if (currentAttempts >= 5) {
        await this.otpCacheRepository.deleteOtp(normalizedEmail);
        throw new BadRequestException({
          code: ErrorCode.INVALID_RESET_OTP,
          message: 'Bạn đã nhập sai mã xác thực quá 5 lần. Mã đã bị hủy.',
        });
      }
      throw new BadRequestException({
        code: ErrorCode.INVALID_RESET_OTP,
        message: 'Mã xác thực không chính xác',
      });
    }

    // 4. Tìm tài khoản người dùng
    const user = await this.userRepository.findByEmail(normalizedEmail);
    if (!user) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_RESET_OTP,
        message: 'Tài khoản không tồn tại',
      });
    }

    // 5. Băm mật khẩu mới bằng argon2 (#62)
    const passwordHash = await argon2.hash(dto.newPassword);

    // 6. Cập nhật người dùng trong DB (mustChangePassword = false, passwordChangedAt = now)
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });

    // 7. Xóa OTP sau khi sử dụng thành công (dùng 1 lần)
    await this.otpCacheRepository.deleteOtp(normalizedEmail);

    return { success: true };
  }
}
