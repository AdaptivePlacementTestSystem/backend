import { Inject, Injectable } from '@nestjs/common';
import type { IUserRepository } from '../../../auth/domain/repositories/user.repository.interface';
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
    const result = await this.userRepository.setActiveAtomically(
      input.actorId,
      input.targetId,
      input.isActive,
    );
    if (result === 'NOT_FOUND') throw accountNotFound();
    if (result === 'FORBIDDEN') {
      throw actionForbidden(
        'Không thể tự khóa, khóa Admin hoặc thao tác khi quyền quản trị không còn hiệu lực.',
      );
    }
    const updated = await this.userRepository.findAccountByUserId(
      input.targetId,
    );
    if (!updated) throw accountNotFound();
    return toAccountView(updated);
  }
}
