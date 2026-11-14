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
      findAccountByUserId: vi.fn().mockResolvedValue(record(UserRole.TEACHER)),
      updateRole: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new ChangeAccountRoleUseCase(repo);
  });

  it('nâng giảng viên lên Admin', async () => {
    await useCase.execute({
      actorId: 'admin-1',
      targetId: 'target',
      role: UserRole.ADMIN,
    });

    expect(repo.updateRole).toHaveBeenCalledWith('target', UserRole.ADMIN);
  });

  it('thu hồi Admin khác về giảng viên', async () => {
    repo.findAccountByUserId.mockResolvedValue(
      record(UserRole.ADMIN, 'admin-2'),
    );

    await useCase.execute({
      actorId: 'admin-1',
      targetId: 'admin-2',
      role: UserRole.TEACHER,
    });

    expect(repo.updateRole).toHaveBeenCalledWith('admin-2', UserRole.TEACHER);
  });

  it('Admin không tự thu hồi quyền của mình: 403 và không ghi (cũng bảo đảm không mất Admin cuối)', async () => {
    repo.findAccountByUserId.mockResolvedValue(
      record(UserRole.ADMIN, 'admin-1'),
    );

    const error = await useCase
      .execute({
        actorId: 'admin-1',
        targetId: 'admin-1',
        role: UserRole.TEACHER,
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(repo.updateRole).not.toHaveBeenCalled();
  });

  it('không đổi quyền của sinh viên: 400', async () => {
    repo.findAccountByUserId.mockResolvedValue(record(UserRole.STUDENT));

    await expect(
      useCase.execute({
        actorId: 'admin-1',
        targetId: 'target',
        role: UserRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.updateRole).not.toHaveBeenCalled();
  });

  it('không đặt role STUDENT hay role lạ: 400', async () => {
    await expect(
      useCase.execute({
        actorId: 'admin-1',
        targetId: 'target',
        role: UserRole.STUDENT as any,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.findAccountByUserId).not.toHaveBeenCalled();
  });

  it('idempotent: đặt đúng role hiện tại không ghi lại', async () => {
    const view = await useCase.execute({
      actorId: 'admin-1',
      targetId: 'target',
      role: UserRole.TEACHER,
    });

    expect(repo.updateRole).not.toHaveBeenCalled();
    expect(view.id).toBe('target');
  });

  it('không tìm thấy tài khoản: 404', async () => {
    repo.findAccountByUserId.mockResolvedValue(null);

    await expect(
      useCase.execute({
        actorId: 'admin-1',
        targetId: 'none',
        role: UserRole.ADMIN,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
