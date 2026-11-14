import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UpdateAccountUseCase } from './update-account.use-case';
import { DuplicateAccountError } from '../../../auth/domain/errors/duplicate-account.error';
import { UserEntity } from '../../../auth/domain/entities/user.entity';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';

const makeRecord = (
  overrides: Partial<{ email: string; fullName: string }> = {},
) => ({
  user: new UserEntity(
    'u-1',
    overrides.email ?? 'old@example.com',
    overrides.fullName ?? 'Tên Cũ',
    UserRole.STUDENT,
    'hash',
  ),
  profile: { kind: 'STUDENT' as const, studentCode: '20110001' },
});

describe('UpdateAccountUseCase', () => {
  let useCase: UpdateAccountUseCase;
  let userRepository: any;

  beforeEach(() => {
    userRepository = {
      findAccountById: vi.fn().mockResolvedValue(makeRecord()),
      findByEmail: vi.fn().mockResolvedValue(null),
      updateAccount: vi
        .fn()
        .mockImplementation(async (_id: string, _kind: string, changes: any) =>
          makeRecord({ email: changes.email, fullName: changes.fullName }),
        ),
    };
    useCase = new UpdateAccountUseCase(userRepository);
  });

  it('đổi họ tên: chỉ ghi họ tên đã trim, không đụng email', async () => {
    await useCase.execute({
      kind: 'STUDENT',
      id: 'u-1',
      fullName: '  Tên Mới ',
    });

    expect(userRepository.updateAccount).toHaveBeenCalledWith(
      'u-1',
      'STUDENT',
      {
        fullName: 'Tên Mới',
      },
    );
    expect(userRepository.findByEmail).not.toHaveBeenCalled();
  });

  it('đổi email: chuẩn hóa chữ thường và kiểm trùng', async () => {
    const view = await useCase.execute({
      kind: 'STUDENT',
      id: 'u-1',
      email: ' New@Example.COM ',
    });

    expect(userRepository.findByEmail).toHaveBeenCalledWith('new@example.com');
    expect(userRepository.updateAccount).toHaveBeenCalledWith(
      'u-1',
      'STUDENT',
      {
        email: 'new@example.com',
      },
    );
    expect(view.email).toBe('new@example.com');
  });

  it('email mới trùng tài khoản khác: 409, trường email', async () => {
    userRepository.findByEmail.mockResolvedValue({ id: 'u-2' });

    const error = await useCase
      .execute({ kind: 'STUDENT', id: 'u-1', email: 'taken@example.com' })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ details: { field: 'email' } });
    expect(userRepository.updateAccount).not.toHaveBeenCalled();
  });

  it('gửi lại đúng email hiện tại (khác hoa thường): không báo trùng và không ghi lại email', async () => {
    userRepository.findByEmail.mockResolvedValue({ id: 'u-1' });

    await useCase.execute({
      kind: 'STUDENT',
      id: 'u-1',
      email: 'OLD@example.com',
      fullName: 'Tên Mới',
    });

    expect(userRepository.updateAccount).toHaveBeenCalledWith(
      'u-1',
      'STUDENT',
      {
        fullName: 'Tên Mới',
      },
    );
  });

  it('không có trường nào để cập nhật: 400 VALIDATION_FAILED', async () => {
    await expect(
      useCase.execute({ kind: 'STUDENT', id: 'u-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userRepository.findAccountById).not.toHaveBeenCalled();
  });

  it('không tìm thấy tài khoản hoặc sai loại: 404', async () => {
    userRepository.findAccountById.mockResolvedValue(null);

    await expect(
      useCase.execute({ kind: 'TEACHER', id: 'u-1', fullName: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(userRepository.findAccountById).toHaveBeenCalledWith(
      'u-1',
      'TEACHER',
    );
    expect(userRepository.updateAccount).not.toHaveBeenCalled();
  });

  it('đua ghi: DuplicateAccountError từ repository được đổi thành 409', async () => {
    userRepository.updateAccount.mockRejectedValue(
      new DuplicateAccountError('email'),
    );

    await expect(
      useCase.execute({ kind: 'STUDENT', id: 'u-1', email: 'new@example.com' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
