import { Inject, Injectable } from '@nestjs/common';
import type { IUserRepository } from '../../../auth/domain/repositories/user.repository.interface';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';
import { AccountView, toAccountView } from '../account-view';
import {
  accountNotFound,
  actionForbidden,
  invalidRequest,
} from '../account-errors';

export type AssignableRole = UserRole.ADMIN | UserRole.TEACHER;

export interface ChangeAccountRoleInput {
  actorId: string;
  targetId: string;
  role: AssignableRole;
}

/**
 * Nâng TEACHER → ADMIN hoặc thu hồi ADMIN → TEACHER (UCADM09, L0, BR-17/18).
 * - Chỉ giữa TEACHER và ADMIN; sinh viên không đổi role được.
 * - Admin không tự thu hồi quyền của mình. Vì người thao tác luôn là một Admin đang
 *   hoạt động khác người bị thu hồi nên quy tắc này cũng bảo đảm không thu hồi
 *   Admin cuối cùng (BR-18).
 * - Hiệu lực ngay: role đọc từ DB ở mọi request, không tin role trong token.
 * - Nhật ký kiểm toán: chưa có nơi lưu (hoãn, nợ đồng bộ 14/11/2026).
 */
@Injectable()
export class ChangeAccountRoleUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(input: ChangeAccountRoleInput): Promise<AccountView> {
    if (input.role !== UserRole.ADMIN && input.role !== UserRole.TEACHER) {
      throw invalidRequest('Chỉ có thể đặt quyền Admin hoặc Giảng viên.');
    }

    const target = await this.userRepository.findAccountByUserId(
      input.targetId,
    );
    if (!target) throw accountNotFound();

    if (target.user.role === UserRole.STUDENT) {
      throw invalidRequest(
        'Chỉ đổi quyền giữa giảng viên và quản trị viên; không áp dụng cho sinh viên.',
      );
    }

    if (input.actorId === input.targetId && input.role !== UserRole.ADMIN) {
      throw actionForbidden(
        'Bạn không thể tự thu hồi quyền quản trị của mình.',
      );
    }

    if (target.user.role === input.role) {
      return toAccountView(target);
    }

    await this.userRepository.updateRole(input.targetId, input.role);
    const updated = await this.userRepository.findAccountByUserId(
      input.targetId,
    );
    return toAccountView(updated ?? target);
  }
}
