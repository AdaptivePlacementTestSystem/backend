import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode } from '@apt/shared-types';
import type { IUserRepository } from '../../../auth/domain/repositories/user.repository.interface';
import type {
  AccountChanges,
  AccountKind,
} from '../../../auth/domain/repositories/account.types';
import { DuplicateAccountError } from '../../../auth/domain/errors/duplicate-account.error';
import { AccountView, duplicateConflict, toAccountView } from '../account-view';

export interface UpdateAccountInput {
  kind: AccountKind;
  id: string;
  fullName?: string;
  email?: string;
}

/** Sửa họ tên và/hoặc email của một SV hoặc GV (S24 "Sửa"). MSSV/mã GV không sửa được. */
@Injectable()
export class UpdateAccountUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(input: UpdateAccountInput): Promise<AccountView> {
    const changes: AccountChanges = {};
    if (input.fullName !== undefined) changes.fullName = input.fullName.trim();
    if (input.email !== undefined) {
      changes.email = input.email.trim().toLowerCase();
    }
    if (changes.fullName === undefined && changes.email === undefined) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Cần cung cấp họ tên hoặc email để cập nhật.',
      });
    }

    const current = await this.userRepository.findAccountById(
      input.id,
      input.kind,
    );
    if (!current) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy tài khoản.',
      });
    }

    if (changes.email !== undefined && changes.email !== current.user.email) {
      const owner = await this.userRepository.findByEmail(changes.email);
      if (owner && owner.id !== current.user.id) {
        throw duplicateConflict('email');
      }
    } else {
      delete changes.email; // không đổi email thì không ghi lại
    }

    try {
      const updated = await this.userRepository.updateAccount(
        input.id,
        input.kind,
        changes,
      );
      return toAccountView(updated);
    } catch (error) {
      if (error instanceof DuplicateAccountError) {
        throw duplicateConflict(error.field);
      }
      throw error;
    }
  }
}
