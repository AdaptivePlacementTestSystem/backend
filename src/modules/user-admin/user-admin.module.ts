import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { UserAdminController } from './presentation/user-admin.controller';
import { AccountActionsController } from './presentation/account-actions.controller';
import { CreateAccountUseCase } from './application/use-cases/create-account.use-case';
import { ListAccountsUseCase } from './application/use-cases/list-accounts.use-case';
import { UpdateAccountUseCase } from './application/use-cases/update-account.use-case';
import { SetAccountActiveUseCase } from './application/use-cases/set-account-active.use-case';
import { ResendTemporaryPasswordUseCase } from './application/use-cases/resend-temporary-password.use-case';
import { ChangeAccountRoleUseCase } from './application/use-cases/change-account-role.use-case';
import { TEMPORARY_PASSWORD_GENERATOR } from './application/ports/temporary-password-generator.port';
import { CryptoTemporaryPasswordGenerator } from './infrastructure/crypto-temporary-password.generator';

/** Quản lý tài khoản SV/GV của Admin (F-22). AuthModule xuất `IUserRepository`. */
@Module({
  imports: [AuthModule, MailModule],
  controllers: [UserAdminController, AccountActionsController],
  providers: [
    CreateAccountUseCase,
    ListAccountsUseCase,
    UpdateAccountUseCase,
    SetAccountActiveUseCase,
    ResendTemporaryPasswordUseCase,
    ChangeAccountRoleUseCase,
    {
      provide: TEMPORARY_PASSWORD_GENERATOR,
      useClass: CryptoTemporaryPasswordGenerator,
    },
  ],
  // Dùng chung cho import tài khoản hàng loạt (user-import)
  exports: [TEMPORARY_PASSWORD_GENERATOR],
})
export class UserAdminModule {}
