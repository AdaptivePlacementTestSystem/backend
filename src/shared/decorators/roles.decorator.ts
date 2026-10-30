import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../modules/auth/domain/enums/user-role.enum';

export const ROLES_KEY = 'roles';

/**
 * @Roles(UserRole.TEACHER, UserRole.ADMIN) — đánh dấu endpoint yêu cầu role cụ thể.
 * Dùng kết hợp với RolesGuard.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
