import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  ListAccountsUseCase,
  MAX_PAGE_SIZE,
} from './list-accounts.use-case';
import { UserEntity } from '../../../auth/domain/entities/user.entity';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';

describe('ListAccountsUseCase', () => {
  let useCase: ListAccountsUseCase;
  let userRepository: any;

  beforeEach(() => {
    userRepository = {
      findAccounts: vi.fn().mockResolvedValue({
        items: [
          {
            user: new UserEntity(
              'u-1',
              'a@e.com',
              'A',
              UserRole.STUDENT,
              'secret-hash',
              null,
              null,
              true,
            ),
            profile: { kind: 'STUDENT', studentCode: '20110001' },
          },
        ],
        total: 41,
        page: 2,
        pageSize: 20,
      }),
    };
    useCase = new ListAccountsUseCase(userRepository);
  });

  it('mặc định trang 1, cỡ trang 20', async () => {
    await useCase.execute({ kind: 'STUDENT' });

    expect(userRepository.findAccounts).toHaveBeenCalledWith({
      kind: 'STUDENT',
      q: undefined,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it('giới hạn cỡ trang tối đa và đưa trang về tối thiểu 1', async () => {
    await useCase.execute({
      kind: 'TEACHER',
      page: 0,
      pageSize: 5000,
      q: 'gv',
    });

    expect(userRepository.findAccounts).toHaveBeenCalledWith({
      kind: 'TEACHER',
      q: 'gv',
      page: 1,
      pageSize: MAX_PAGE_SIZE,
    });
  });

  it('trả dạng AccountView: có mã hồ sơ, cờ khóa, đã đổi mật khẩu; không có mã băm', async () => {
    const result = await useCase.execute({ kind: 'STUDENT', page: 2 });

    expect(result.total).toBe(41);
    expect(result.items[0]).toMatchObject({
      id: 'u-1',
      email: 'a@e.com',
      studentCode: '20110001',
      isActive: true,
      mustChangePassword: true,
    });
    expect(JSON.stringify(result)).not.toContain('secret-hash');
  });
});
