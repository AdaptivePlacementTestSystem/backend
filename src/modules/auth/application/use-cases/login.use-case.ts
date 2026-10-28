import { Injectable, UnauthorizedException, Inject, ForbiddenException } from '@nestjs/common';
import type { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { JwtProvider } from '../../infrastructure/providers/jwt.provider';
import { LoginDto, AuthResponseDto } from '../dto/login.dto';
import * as argon2 from 'argon2';

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
    private readonly jwtProvider: JwtProvider,
  ) {}

  async execute(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin.');
    }

    // #62: mật khẩu băm argon2; lỗi định dạng hash coi như sai mật khẩu
    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password).catch(() => false);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Thông tin đăng nhập không chính xác');
    }

    const token = this.jwtProvider.generateToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }
}
