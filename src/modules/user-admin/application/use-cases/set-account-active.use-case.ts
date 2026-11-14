import { Inject, Injectable } from '@nestjs/common';
import type { IUserRepository } from '../../../auth/domain/repositories/user.repository.interface';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';
import { AccountView, toAccountView } from '../account-view';
import { accountNotFound, actionForbidden } from '../account-errors';

export interface SetAccountActiveInput {
  /** Id của Admin đang thao tác. */
  actorId: string;
  /** Id tài khoản bị khóa hoặc mở khóa. */
  targetId: string;
  /** `false` = khóa, `true` = mở khóa. */
  isActive: boolean;
}

/**
 * Khóa / mở khóa tài khoản SV hoặc GV (BR-19, UCADM09).
 * - Không khóa chính mình và không khóa tài khoản Admin (chốt 14/11/2026: muốn khóa
 *   Admin thì thu hồi quyền trước). Mở khóa không bị giới hạn này.
 * - Idempotent: khóa tài khoản đã khóa thì trả lại trạng thái hiện tại.
 * - Hiệu lực ngay: `JwtStrategy` đọc `isActive` từ DB ở mọi request; phiên đang làm
 *   không xử lý riêng, quá `expires_at` thì theo K5.
 */
@Injectable()
export class SetAccountActiveUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(input: SetAccountActiveInput): Promise<AccountView> {
    const target = await this.userRepository.findAccountByUserId(
      input.targetId,
    );
    if (!target) throw accountNotFound();

    if (!input.isActive) {
      if (input.actorId === input.targetId) {
        throw actionForbidden('Bạn không thể tự khóa chính mình.');
      }
      if (target.user.role === UserRole.ADMIN) {
        throw actionForbidden(
          'Không thể khóa tài khoản quản trị viên. Hãy thu hồi quyền quản trị trước.',
        );
      }
    }

    if (target.user.isActive === input.isActive) {
      return toAccountView(target);
    }

    await this.userRepository.setActive(input.targetId, input.isActive);
    const updated = await this.userRepository.findAccountByUserId(
      input.targetId,
    );
    return toAccountView(updated ?? target);
  }
}
