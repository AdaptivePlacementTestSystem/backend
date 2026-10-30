import { UserRole } from '../../../auth/domain/enums/user-role.enum';

export interface ProfileActor {
  userId: string;
  role: UserRole;
}

export interface ProfileTarget {
  userId: string;
}

export type AccessDecision = {
  allowed: boolean;
  reason?: string;
};

/**
 * ProfileAccessPolicy — Pure domain logic kiểm tra quyền xem hồ sơ năng lực (SRS Mục 15.4, Single-tenant v3.0).
 * Không import NestJS / Prisma — phục vụ test độc lập nhanh chóng.
 */
export class ProfileAccessPolicy {
  static canView(actor: ProfileActor, target: ProfileTarget): AccessDecision {
    if (actor.role === UserRole.ADMIN) {
      return { allowed: true };
    }

    if (actor.role === UserRole.EDUZ_SERVICE) {
      return { allowed: true };
    }

    if (actor.role === UserRole.STUDENT) {
      if (actor.userId === target.userId) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'Sinh viên chỉ có thể xem hồ sơ của chính mình',
      };
    }

    if (actor.role === UserRole.TEACHER) {
      return { allowed: true };
    }

    return { allowed: false, reason: 'Không có quyền truy cập' };
  }
}
