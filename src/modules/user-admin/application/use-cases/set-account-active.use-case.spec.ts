import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SetAccountActiveUseCase } from './set-account-active.use-case';
import { UserEntity } from '../../../auth/domain/entities/user.entity';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';

const record = (role: UserRole, isActive = true, id = 'target') => ({
  user: new UserEntity(
    id,
    'x@example.com',
    'Tên',
    role,
    'hash',
    null,
    null,
    false,
    isActive,
  ),
  profile:
    role === UserRole.STUDENT
      ? { kind: 'STUDENT' as const, studentCode: '1' }
      : { kind: 'TEACHER' as const, teacherCode: 'GV1' },
});

describe('SetAccountActiveUseCase', () => {
  let useCase: SetAccountActiveUseCase;
  let repo: any;

  beforeEach(() => {
    repo = {
      findAccountByUserId: vi.fn().mockResolvedValue(record(UserRole.STUDENT)),
      setActive: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new SetAccountActiveUseCase(repo);
  });

  it('khóa sinh viên: ghi isActive = false', async () => {
    await useCase.execute({
      actorId: 'admin-1',
      targetId: 'target',
      isActive: false,
    });

    expect(repo.setActive).toHaveBeenCalledWith('target', false);
  });

  it('khóa giảng viên thường: được phép', async () => {
    repo.findAccountByUserId.mockResolvedValue(record(UserRole.TEACHER));

    await useCase.execute({
      actorId: 'admin-1',
      targetId: 'target',
      isActive: false,
    });

    expect(repo.setActive).toHaveBeenCalledWith('target', false);
  });

  it('mở khóa tài khoản đang bị khóa: ghi isActive = true', async () => {
    repo.findAccountByUserId.mockResolvedValue(record(UserRole.STUDENT, false));

    await useCase.execute({
      actorId: 'admin-1',
      targetId: 'target',
      isActive: true,
    });

    expect(repo.setActive).toHaveBeenCalledWith('target', true);
  });

  it('Admin không tự khóa chính mình: 403 và không ghi', async () => {
    repo.findAccountByUserId.mockResolvedValue(
      record(UserRole.ADMIN, true, 'admin-1'),
    );

    const error = await useCase
      .execute({ actorId: 'admin-1', targetId: 'admin-1', isActive: false })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse().message).toContain('tự khóa');
    expect(repo.setActive).not.toHaveBeenCalled();
  });

  it('không khóa Admin khác (phải thu hồi quyền trước): 403', async () => {
    repo.findAccountByUserId.mockResolvedValue(
      record(UserRole.ADMIN, true, 'admin-2'),
    );

    await expect(
      useCase.execute({
        actorId: 'admin-1',
        targetId: 'admin-2',
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.setActive).not.toHaveBeenCalled();
  });

  it('mở khóa tài khoản Admin (đã bị khóa trước đó) vẫn được', async () => {
    repo.findAccountByUserId.mockResolvedValue(
      record(UserRole.ADMIN, false, 'admin-2'),
    );

    await useCase.execute({
      actorId: 'admin-1',
      targetId: 'admin-2',
      isActive: true,
    });

    expect(repo.setActive).toHaveBeenCalledWith('admin-2', true);
  });

  it('idempotent: khóa tài khoản đã khóa không ghi lại', async () => {
    repo.findAccountByUserId.mockResolvedValue(record(UserRole.STUDENT, false));

    const view = await useCase.execute({
      actorId: 'admin-1',
      targetId: 'target',
      isActive: false,
    });

    expect(repo.setActive).not.toHaveBeenCalled();
    expect(view.isActive).toBe(false);
  });

  it('không tìm thấy tài khoản: 404', async () => {
    repo.findAccountByUserId.mockResolvedValue(null);

    await expect(
      useCase.execute({
        actorId: 'admin-1',
        targetId: 'none',
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
