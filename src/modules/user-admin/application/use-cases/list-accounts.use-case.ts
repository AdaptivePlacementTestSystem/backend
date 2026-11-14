import { Inject, Injectable } from '@nestjs/common';
import type { IUserRepository } from '../../../auth/domain/repositories/user.repository.interface';
import type {
  AccountKind,
  Paged,
} from '../../../auth/domain/repositories/account.types';
import { AccountView, toAccountView } from '../account-view';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface ListAccountsInput {
  kind: AccountKind;
  q?: string;
  page?: number;
  pageSize?: number;
}

/** Danh sách SV hoặc GV (S24): tìm theo MSSV/mã GV, email, họ tên; có phân trang. */
@Injectable()
export class ListAccountsUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(input: ListAccountsInput): Promise<Paged<AccountView>> {
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(input.pageSize ?? DEFAULT_PAGE_SIZE)),
    );
    const result = await this.userRepository.findAccounts({
      kind: input.kind,
      q: input.q,
      page,
      pageSize,
    });
    return { ...result, items: result.items.map(toAccountView) };
  }
}
