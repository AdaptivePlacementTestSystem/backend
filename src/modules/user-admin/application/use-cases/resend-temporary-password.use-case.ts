import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { IUserRepository } from '../../../auth/domain/repositories/user.repository.interface';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';
import type { IMailPort } from '../../../mail/domain/ports/mail.port';
import {
  TEMPORARY_PASSWORD_GENERATOR,
  type ITemporaryPasswordGenerator,
} from '../ports/temporary-password-generator.port';
import { AccountView, toAccountView } from '../account-view';
import { accountNotFound, actionForbidden } from '../account-errors';

/**
 * Gửi lại mật khẩu tạm (BR-19, UCADM09): sinh mật khẩu mới, băm argon2,
 * `mustChangePassword = true`, đồng thời `passwordChangedAt = now` nên token cũ mất hiệu lực.
 * Cho phép với tài khoản đã đổi mật khẩu rồi (chốt 14/11/2026). Chỉ áp dụng cho SV và GV.
 * Email gửi sau khi lưu; khi gửi lỗi, báo rõ mật khẩu đã đổi nhưng email chưa gửi được.
 */
@Injectable()
export class ResendTemporaryPasswordUseCase {
  private readonly logger = new Logger(ResendTemporaryPasswordUseCase.name);

  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
    @Inject(TEMPORARY_PASSWORD_GENERATOR)
    private readonly passwordGenerator: ITemporaryPasswordGenerator,
    @Inject('IMailPort')
    private readonly mailPort: IMailPort,
  ) {}

  async execute(targetId: string): Promise<AccountView> {
    const target = await this.userRepository.findAccountByUserId(targetId);
    if (!target) throw accountNotFound();
    if (target.user.role === UserRole.ADMIN) {
      throw actionForbidden(
        'Không thể gửi lại mật khẩu tạm cho tài khoản quản trị viên.',
      );
    }

    const temporaryPassword = this.passwordGenerator.generate();
    await this.userRepository.updatePassword(
      targetId,
      await argon2.hash(temporaryPassword),
      { mustChangePassword: true },
    );

    await this.sendMail(
      target.user.email,
      target.user.fullName,
      temporaryPassword,
      target.profile,
    );

    const updated = await this.userRepository.findAccountByUserId(targetId);
    return toAccountView(updated ?? target);
  }

  private async sendMail(
    email: string,
    fullName: string,
    temporaryPassword: string,
    profile: { kind: 'STUDENT' | 'TEACHER'; studentCode?: string },
  ): Promise<void> {
    try {
      const sent = await this.mailPort.sendTemporaryPassword(
        email,
        fullName,
        temporaryPassword,
        profile.kind === 'STUDENT' ? profile.studentCode : undefined,
      );
      if (!sent) throw new Error('MAIL_DELIVERY_FAILED');
    } catch {
      this.logger.warn('Không gửi được email mật khẩu tạm.');
      throw new ServiceUnavailableException({
        code: 'MAIL_DELIVERY_FAILED',
        message:
          'Mật khẩu đã được đặt lại nhưng email chưa gửi được. Hãy kiểm tra cấu hình email và gửi lại.',
      });
    }
  }
}
