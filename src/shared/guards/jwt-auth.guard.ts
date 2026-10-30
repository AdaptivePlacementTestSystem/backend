import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard xác thực JWT — áp dụng toàn cục qua AppModule hoặc decorator @UseGuards().
 * Sau khi pass, request.user chứa payload JWT { sub, email, role }.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(err: any, user: any): TUser {
    if (err || !user) {
      throw (
        err || new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn')
      );
    }
    return user;
  }
}
