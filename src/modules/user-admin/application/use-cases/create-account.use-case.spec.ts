import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ErrorCode } from '@apt/shared-types';
import { CreateAccountUseCase } from './create-account.use-case';
import { DuplicateAccountError } from '../../../auth/domain/errors/duplicate-account.error';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';
import { AuthProviderType } from '../../../auth/domain/enums/auth-provider-type.enum';
import type { UserEntity } from '../../../auth/domain/entities/user.entity';
import type {
  AccountProfile,
  AccountRecord,
} from '../../../auth/domain/repositories/account.types';

const TEMP_PASSWORD = 'Tmp#Pass-12x';

describe('CreateAccountUseCase', () => {
  let useCase: CreateAccountUseCase;
  let userRepository: any;
  let passwordGenerator: any;
  let mailPort: any;

  beforeEach(() => {
    userRepository = {
      findByEmail: vi.fn().mockResolvedValue(null),
      findByStudentCode: vi.fn().mockResolvedValue(null),
      findByTeacherCode: vi.fn().mockResolvedValue(null),
      createAccount: vi
        .fn()
        .mockImplementation(
          async (
            user: UserEntity,
            profile: AccountProfile,
          ): Promise<AccountRecord> => ({
            user,
            profile,
          }),
        ),
    };
    passwordGenerator = { generate: vi.fn().mockReturnValue(TEMP_PASSWORD) };
    mailPort = { sendTemporaryPassword: vi.fn().mockResolvedValue(true) };
    useCase = new CreateAccountUseCase(
      userRepository,
      passwordGenerator,
      mailPort,
    );
  });

  it('tạo sinh viên: role STUDENT, mustChangePassword, LOCAL, mật khẩu băm argon2', async () => {
    const view = await useCase.execute({
      kind: 'STUDENT',
      studentCode: ' 20110001 ',
      fullName: ' Nguyễn Văn A ',
      email: ' A.Nguyen@Example.COM ',
    });

    const [user, profile] = userRepository.createAccount.mock.calls[0] as [
      UserEntity,
      AccountProfile,
    ];
    expect(user.email).toBe('a.nguyen@example.com');
    expect(user.fullName).toBe('Nguyễn Văn A');
    expect(user.role).toBe(UserRole.STUDENT);
    expect(user.authProvider).toBe(AuthProviderType.LOCAL);
    expect(user.mustChangePassword).toBe(true);
    expect(user.isActive).toBe(true);
    expect(user.passwordHash).not.toBe(TEMP_PASSWORD);
    expect(await argon2.verify(user.passwordHash!, TEMP_PASSWORD)).toBe(true);
    expect(profile).toEqual({ kind: 'STUDENT', studentCode: '20110001' });
    expect(view.studentCode).toBe('20110001');
    expect(view.teacherCode).toBeUndefined();
  });

  it('tạo giảng viên: role TEACHER, hồ sơ mã GV, không truyền MSSV vào email', async () => {
    const view = await useCase.execute({
      kind: 'TEACHER',
      teacherCode: 'GV001',
      fullName: 'Trần Thị B',
      email: 'b@example.com',
    });

    const [user, profile] = userRepository.createAccount.mock.calls[0] as [
      UserEntity,
      AccountProfile,
    ];
    expect(user.role).toBe(UserRole.TEACHER);
    expect(profile).toEqual({ kind: 'TEACHER', teacherCode: 'GV001' });
    expect(view.teacherCode).toBe('GV001');
    expect(mailPort.sendTemporaryPassword).toHaveBeenCalledWith(
      'b@example.com',
      'Trần Thị B',
      TEMP_PASSWORD,
      undefined,
    );
  });

  it('gửi email một lần, sau khi lưu, kèm MSSV cho sinh viên', async () => {
    const order: string[] = [];
    userRepository.createAccount.mockImplementation(
      async (user: UserEntity, profile: AccountProfile) => {
        order.push('save');
        return { user, profile };
      },
    );
    mailPort.sendTemporaryPassword.mockImplementation(async () => {
      order.push('mail');
      return true;
    });

    await useCase.execute({
      kind: 'STUDENT',
      studentCode: '20110001',
      fullName: 'A',
      email: 'a@example.com',
    });

    expect(order).toEqual(['save', 'mail']);
    expect(mailPort.sendTemporaryPassword).toHaveBeenCalledTimes(1);
    expect(mailPort.sendTemporaryPassword).toHaveBeenCalledWith(
      'a@example.com',
      'A',
      TEMP_PASSWORD,
      '20110001',
    );
  });

  it('kết quả trả về không chứa mật khẩu hay mã băm', async () => {
    const view = await useCase.execute({
      kind: 'STUDENT',
      studentCode: '20110001',
      fullName: 'A',
      email: 'a@example.com',
    });
    const json = JSON.stringify(view);
    expect(json).not.toContain(TEMP_PASSWORD);
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain('argon2');
  });

  it('email trùng: 409 CONFLICT, trường email, không lưu và không gửi mail', async () => {
    userRepository.findByEmail.mockResolvedValue({ id: 'other' });

    const error = await useCase
      .execute({
        kind: 'STUDENT',
        studentCode: '1',
        fullName: 'A',
        email: 'A@Example.com',
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: ErrorCode.CONFLICT,
      message: 'Email đã tồn tại.',
      details: { field: 'email' },
    });
    expect(userRepository.findByEmail).toHaveBeenCalledWith('a@example.com');
    expect(userRepository.createAccount).not.toHaveBeenCalled();
    expect(mailPort.sendTemporaryPassword).not.toHaveBeenCalled();
  });

  it('MSSV trùng: 409, trường studentCode', async () => {
    userRepository.findByStudentCode.mockResolvedValue({ id: 'other' });

    const error = await useCase
      .execute({
        kind: 'STUDENT',
        studentCode: '20110001',
        fullName: 'A',
        email: 'a@e.com',
      })
      .catch((e) => e);

    expect(error.getResponse()).toMatchObject({
      message: 'MSSV đã tồn tại.',
      details: { field: 'studentCode' },
    });
    expect(userRepository.createAccount).not.toHaveBeenCalled();
  });

  it('mã GV trùng: 409, trường teacherCode', async () => {
    userRepository.findByTeacherCode.mockResolvedValue({ id: 'other' });

    const error = await useCase
      .execute({
        kind: 'TEACHER',
        teacherCode: 'GV001',
        fullName: 'B',
        email: 'b@e.com',
      })
      .catch((e) => e);

    expect(error.getResponse()).toMatchObject({
      message: 'Mã GV đã tồn tại.',
      details: { field: 'teacherCode' },
    });
  });

  it('MSSV chỉ kiểm khi tạo sinh viên, mã GV chỉ kiểm khi tạo giảng viên', async () => {
    await useCase.execute({
      kind: 'TEACHER',
      teacherCode: 'GV1',
      fullName: 'B',
      email: 'b@e.com',
    });
    expect(userRepository.findByStudentCode).not.toHaveBeenCalled();

    await useCase.execute({
      kind: 'STUDENT',
      studentCode: '1',
      fullName: 'A',
      email: 'a@e.com',
    });
    expect(userRepository.findByTeacherCode).toHaveBeenCalledTimes(1); // chỉ lần GV ở trên
  });

  it('đua ghi: DuplicateAccountError từ repository được đổi thành 409 đúng trường', async () => {
    userRepository.createAccount.mockRejectedValue(
      new DuplicateAccountError('studentCode'),
    );

    const error = await useCase
      .execute({
        kind: 'STUDENT',
        studentCode: '1',
        fullName: 'A',
        email: 'a@e.com',
      })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      details: { field: 'studentCode' },
    });
    expect(mailPort.sendTemporaryPassword).not.toHaveBeenCalled();
  });

  it('lỗi hệ thống khác từ repository được ném lại nguyên vẹn', async () => {
    userRepository.createAccount.mockRejectedValue(new Error('db down'));

    await expect(
      useCase.execute({
        kind: 'STUDENT',
        studentCode: '1',
        fullName: 'A',
        email: 'a@e.com',
      }),
    ).rejects.toThrow('db down');
  });

  it('gửi mail lỗi (ném lỗi): tài khoản vẫn được tạo, không ném ra ngoài (BR-05)', async () => {
    mailPort.sendTemporaryPassword.mockRejectedValue(new Error('SMTP down'));

    const view = await useCase.execute({
      kind: 'STUDENT',
      studentCode: '1',
      fullName: 'A',
      email: 'a@e.com',
    });

    expect(view.email).toBe('a@e.com');
    expect(userRepository.createAccount).toHaveBeenCalledTimes(1);
  });

  it('gửi mail trả false: tài khoản vẫn được tạo', async () => {
    mailPort.sendTemporaryPassword.mockResolvedValue(false);

    const view = await useCase.execute({
      kind: 'TEACHER',
      teacherCode: 'GV1',
      fullName: 'B',
      email: 'b@e.com',
    });

    expect(view.teacherCode).toBe('GV1');
  });
});
