import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ChangeAccountRoleUseCase } from './change-account-role.use-case';
import { UserEntity } from '../../../auth/domain/entities/user.entity';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';

const record = (role: UserRole, id = 'target') => ({
  user: new UserEntity(id, 'x@example.com', 'Tên', role, 'hash'),
  profile: { kind: 'TEACHER' as const, teacherCode: 'GV1' },
});

describe('ChangeAccountRoleUseCase', () => {
  let useCase: ChangeAccountRoleUseCase;
  let repo: any;
  beforeEach(() => {
    repo = {
      changeRoleAtomically: vi.fn().mockResolvedValue('UPDATED'),
      findAccountByUserId: vi.fn().mockResolvedValue(record(UserRole.ADMIN)),
    };
    useCase = new ChangeAccountRoleUseCase(repo);
  });
  it('ủy quyền thay role nguyên tử cho repository', async () => {
    await useCase.execute({
      actorId: 'admin-1',
      targetId: 'target',
      role: UserRole.ADMIN,
    });
    expect(repo.changeRoleAtomically).toHaveBeenCalledWith(
      'admin-1',
      'target',
      UserRole.ADMIN,
    );
  });
  it('trả tài khoản khi role không đổi', async () => {
    repo.changeRoleAtomically.mockResolvedValue('UNCHANGED');
    expect(
      (
        await useCase.execute({
          actorId: 'a',
          targetId: 'target',
          role: UserRole.TEACHER,
        })
      ).id,
    ).toBe('target');
  });
  it.each([
    ['FORBIDDEN', ForbiddenException],
    ['INVALID_TARGET', BadRequestException],
    ['NOT_FOUND', NotFoundException],
  ])('chuyển kết quả %s thành lỗi', async (result, error) => {
    repo.changeRoleAtomically.mockResolvedValue(result);
    await expect(
      useCase.execute({
        actorId: 'a',
        targetId: 'target',
        role: UserRole.TEACHER,
      }),
    ).rejects.toBeInstanceOf(error);
    expect(repo.findAccountByUserId).not.toHaveBeenCalled();
  });
  it('không chấp nhận role STUDENT', async () => {
    await expect(
      useCase.execute({
        actorId: 'a',
        targetId: 'target',
        role: UserRole.STUDENT as any,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.changeRoleAtomically).not.toHaveBeenCalled();
  });
});
