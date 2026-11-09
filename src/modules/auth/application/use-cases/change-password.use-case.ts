import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import type { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { JwtProvider } from '../../infrastructure/providers/jwt.provider';
import {
  ChangePasswordDto,
  ChangePasswordResponseDto,
} from '../dto/change-password.dto';
import { ErrorCode } from '@apt/shared-types';
import * as argon2 from 'argon2';

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
    private readonly jwtProvider: JwtProvider,
  ) {}

  async execute(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<ChangePasswordResponseDto> {
    const user = await this.userRepository.findById(userId);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHENTICATED,
        message: 'Người dùng không tồn tại hoặc chưa thiết lập mật khẩu',
      });
    }

    // 1. Kiểm tra mật khẩu hiện tại
    const isCurrentValid = await argon2
      .verify(user.passwordHash, dto.currentPassword)
      .catch(() => false);

    if (!isCurrentValid) {
      throw new BadRequestException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Mật khẩu hiện tại không chính xác',
      });
    }

    // 2. Không cho phép trùng mật khẩu cũ
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại',
      });
    }

    // 3. Băm mật khẩu mới bằng argon2 (#62)
    const newPasswordHash = await argon2.hash(dto.newPassword);

    // 4. Lưu qua repository (mustChangePassword = false, passwordChangedAt = now)
    await this.userRepository.updatePassword(user.id, newPasswordHash);

    // 5. Cấp token mới: các token cũ (iat < passwordChangedAt) bị JwtStrategy từ chối
    const token = this.jwtProvider.generateToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken: token,
    };
  }
}
