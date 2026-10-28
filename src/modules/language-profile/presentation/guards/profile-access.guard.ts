import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProfileAccessPolicy } from '../../domain/policies/profile-access.policy';
import { PrismaProfileTargetLookup } from '../../infrastructure/persistence/prisma-profile-target.lookup';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';

/**
 * ProfileAccessGuard — Guard kiểm tra RBAC cho hồ sơ năng lực (SRS Mục 15.4, Single-tenant v3.0).
 * Áp dụng cho các endpoint xem profile theo :studentCode.
 */
@Injectable()
export class ProfileAccessGuard implements CanActivate {
  constructor(private readonly targetLookup: PrismaProfileTargetLookup) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const studentCode = request.params.studentCode;

    if (!user) {
      throw new ForbiddenException('Chưa xác thực danh tính');
    }

    const target = await this.targetLookup.findStudentByCode(studentCode);
    if (!target) {
      throw new NotFoundException(`Không tìm thấy sinh viên có mã: ${studentCode}`);
    }

    const decision = ProfileAccessPolicy.canView(
      {
        userId: user.sub,
        role: user.role as UserRole,
      },
      target,
    );

    if (!decision.allowed) {
      throw new ForbiddenException(decision.reason || 'Không có quyền truy cập hồ sơ này');
    }

    request.targetStudent = target;
    return true;
  }
}
