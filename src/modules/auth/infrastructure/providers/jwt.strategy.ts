import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@apt/shared-types';
import type { IUserRepository } from '../../domain/repositories/user.repository.interface';
import type { JwtTokenPayload } from './jwt.provider';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  /**
   * Đọc trạng thái mới nhất của tài khoản từ DB mỗi request (D1/D2, #134):
   * - tài khoản không còn hoặc bị khóa → 401;
   * - token cấp trước lần đổi mật khẩu gần nhất → 401.
   * `iat` tính bằng giây nên so sánh ở mức giây (token cấp ngay sau khi đổi mật khẩu vẫn hợp lệ).
   */
  async validate(
    payload: JwtTokenPayload & { iat?: number },
  ): Promise<AuthenticatedUser> {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHENTICATED,
        message: 'Tài khoản không tồn tại hoặc đã bị khóa',
      });
    }

    if (user.passwordChangedAt && payload.iat !== undefined) {
      const changedAtSeconds = Math.floor(
        user.passwordChangedAt.getTime() / 1000,
      );
      if (payload.iat < changedAtSeconds) {
        throw new UnauthorizedException({
          code: ErrorCode.UNAUTHENTICATED,
          message: 'Phiên đăng nhập đã hết hiệu lực, vui lòng đăng nhập lại',
        });
      }
    }

    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
