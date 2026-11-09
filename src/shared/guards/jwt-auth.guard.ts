import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ErrorCode } from '@apt/shared-types';
import { ALLOW_WHEN_MUST_CHANGE_PASSWORD_KEY } from '../decorators/allow-when-must-change-password.decorator';
import type { JwtPayload } from '../decorators/current-user.decorator';

/**
 * Guard xác thực JWT — dùng qua @UseGuards(JwtAuthGuard).
 * Sau khi pass, request.user chứa { sub, email, role, mustChangePassword }
 * (JwtStrategy đọc trạng thái mới nhất từ DB).
 *
 * Ép đổi mật khẩu lần đầu (D1, DECISIONS_LOG #134): nếu `mustChangePassword`
 * còn bật thì chỉ endpoint gắn @AllowWhenMustChangePassword() được gọi; còn lại 403.
 * Kiểm tra ở đây (không phải guard riêng) vì APP_GUARD chạy trước khi request.user được gắn.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  handleRequest<TUser = any>(
    err: any,
    user: any,
    _info?: any,
    context?: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw (
        err || new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn')
      );
    }

    if ((user as JwtPayload).mustChangePassword && context) {
      const allowed = this.reflector.getAllAndOverride<boolean>(
        ALLOW_WHEN_MUST_CHANGE_PASSWORD_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!allowed) {
        throw new ForbiddenException({
          code: ErrorCode.PASSWORD_CHANGE_REQUIRED,
          message: 'Bạn cần đổi mật khẩu trước khi tiếp tục sử dụng hệ thống',
        });
      }
    }

    return user;
  }
}
