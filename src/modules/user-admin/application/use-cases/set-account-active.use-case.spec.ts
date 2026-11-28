import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SetAccountActiveUseCase } from './set-account-active.use-case';
import { UserEntity } from '../../../auth/domain/entities/user.entity';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';

describe('SetAccountActiveUseCase', () => {
  let useCase: SetAccountActiveUseCase;
  let repo: any;
  beforeEach(() => {
    repo = {
      setActiveAtomically: vi.fn().mockResolvedValue('UPDATED'),
      findAccountByUserId: vi
        .fn()
        .mockResolvedValue({
          user: new UserEntity(
            'target',
            'x@example.com',
            'Tên',
            UserRole.STUDENT,
            'hash',
          ),
          profile: { kind: 'STUDENT', studentCode: '1' },
        }),
    };
    useCase = new SetAccountActiveUseCase(repo);
  });
  it('ủy quyền khóa/mở khóa nguyên tử', async () => {
    await useCase.execute({
      actorId: 'admin-1',
      targetId: 'target',
      isActive: false,
    });
    expect(repo.setActiveAtomically).toHaveBeenCalledWith(
      'admin-1',
      'target',
      false,
    );
  });
  it('trả tài khoản khi trạng thái không đổi', async () => {
    repo.setActiveAtomically.mockResolvedValue('UNCHANGED');
    expect(
      (
        await useCase.execute({
          actorId: 'a',
          targetId: 'target',
          isActive: true,
        })
      ).id,
    ).toBe('target');
  });
  it.each([
    ['FORBIDDEN', ForbiddenException],
    ['NOT_FOUND', NotFoundException],
  ])('chuyển %s thành lỗi', async (result, error) => {
    repo.setActiveAtomically.mockResolvedValue(result);
    await expect(
      useCase.execute({ actorId: 'a', targetId: 'target', isActive: false }),
    ).rejects.toBeInstanceOf(error);
    expect(repo.findAccountByUserId).not.toHaveBeenCalled();
  });
});
