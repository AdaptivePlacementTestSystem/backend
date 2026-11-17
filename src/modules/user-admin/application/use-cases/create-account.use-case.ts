import { Inject, Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import type { IUserRepository } from '../../../auth/domain/repositories/user.repository.interface';
import type {
  AccountProfile,
  AccountRecord,
} from '../../../auth/domain/repositories/account.types';
import { DuplicateAccountError } from '../../../auth/domain/errors/duplicate-account.error';
import { UserEntity } from '../../../auth/domain/entities/user.entity';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';
import { AuthProviderType } from '../../../auth/domain/enums/auth-provider-type.enum';
import type { IMailPort } from '../../../mail/domain/ports/mail.port';
import {
  TEMPORARY_PASSWORD_GENERATOR,
  type ITemporaryPasswordGenerator,
} from '../ports/temporary-password-generator.port';
import { AccountView, duplicateConflict, toAccountView } from '../account-view';

export type CreateAccountInput =
  | { kind: 'STUDENT'; studentCode: string; fullName: string; email: string }
  | { kind: 'TEACHER'; teacherCode: string; fullName: string; email: string };

/**
 * UCADM09 / luồng L1b: Admin tạo từng tài khoản SV hoặc GV.
 * Chuẩn hóa dữ liệu → kiểm trùng (BR-02) → sinh mật khẩu tạm, băm argon2 → lưu
 * (mustChangePassword = true, authProvider LOCAL) → gửi email SAU khi lưu (BR-05).
 * Gửi email lỗi chỉ ghi log, không rollback tài khoản.
 */
@Injectable()
export class CreateAccountUseCase {
  private readonly logger = new Logger(CreateAccountUseCase.name);

  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
    @Inject(TEMPORARY_PASSWORD_GENERATOR)
    private readonly passwordGenerator: ITemporaryPasswordGenerator,
    @Inject('IMailPort')
    private readonly mailPort: IMailPort,
  ) {}

  async execute(input: CreateAccountInput): Promise<AccountView> {
    const email = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();
    const profile: AccountProfile =
      input.kind === 'STUDENT'
        ? { kind: 'STUDENT', studentCode: input.studentCode.trim() }
        : { kind: 'TEACHER', teacherCode: input.teacherCode.trim() };

    await this.assertNotDuplicate(email, profile);

    const temporaryPassword = this.passwordGenerator.generate();
    const user = new UserEntity(
      randomUUID(),
      email,
      fullName,
      input.kind === 'STUDENT' ? UserRole.STUDENT : UserRole.TEACHER,
      await argon2.hash(temporaryPassword),
      AuthProviderType.LOCAL,
      null,
      true, // mustChangePassword
      true, // isActive
      null,
    );

    let record: AccountRecord;
    try {
      record = await this.userRepository.createAccount(user, profile);
    } catch (error) {
      // Đua ghi: hai yêu cầu cùng lọt qua bước kiểm trùng.
      if (error instanceof DuplicateAccountError) {
        throw duplicateConflict(error.field);
      }
      throw error;
    }

    await this.sendTemporaryPassword(
      email,
      fullName,
      temporaryPassword,
      profile,
    );
    return toAccountView(record);
  }

  private async assertNotDuplicate(
    email: string,
    profile: AccountProfile,
  ): Promise<void> {
    if (await this.userRepository.findByEmail(email)) {
      throw duplicateConflict('email');
    }
    if (profile.kind === 'STUDENT') {
      if (await this.userRepository.findByStudentCode(profile.studentCode)) {
        throw duplicateConflict('studentCode');
      }
    } else if (
      await this.userRepository.findByTeacherCode(profile.teacherCode)
    ) {
      throw duplicateConflict('teacherCode');
    }
  }

  private async sendTemporaryPassword(
    email: string,
    fullName: string,
    temporaryPassword: string,
    profile: AccountProfile,
  ): Promise<void> {
    try {
      const sent = await this.mailPort.sendTemporaryPassword(
        email,
        fullName,
        temporaryPassword,
        profile.kind === 'STUDENT' ? profile.studentCode : undefined,
      );
      if (!sent) {
        this.logger.warn(`Không gửi được email mật khẩu tạm cho ${email}`);
      }
    } catch (error) {
      // Không ghi mật khẩu vào log; tài khoản vẫn được giữ (BR-05).
      this.logger.warn(
        `Lỗi gửi email mật khẩu tạm cho ${email}: ${(error as Error).message}`,
      );
    }
  }
}
