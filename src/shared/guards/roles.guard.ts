import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../modules/auth/domain/enums/user-role.enum';

/**
 * Guard kiểm tra ROLE — chỉ kiểm tra *vai trò*, không kiểm tra quan hệ ownership.
 * Để kiểm tra ownership (SV xem profile của chính mình, GV xem SV cùng trường),
 * dùng ProfileAccessGuard tại language-profile/presentation/guards/.
 *
 * SRS Mục 15.4 — RBAC 4 roles: STUDENT, TEACHER, ADMIN, EDUZ_SERVICE
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // không có @Roles() → pass
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user: { role: UserRole } }>();

    if (!requiredRoles.includes(user?.role)) {
      throw new ForbiddenException(
        `Yêu cầu quyền: ${requiredRoles.join(' hoặc ')}`,
      );
    }

    return true;
  }
}
