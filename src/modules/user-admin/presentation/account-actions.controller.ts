import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../../shared/decorators/current-user.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import type { AccountView } from '../application/account-view';
import { ChangeRoleDto } from '../application/dto/change-role.dto';
import { SetAccountActiveUseCase } from '../application/use-cases/set-account-active.use-case';
import { ResendTemporaryPasswordUseCase } from '../application/use-cases/resend-temporary-password.use-case';
import { ChangeAccountRoleUseCase } from '../application/use-cases/change-account-role.use-case';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { AccountResponseDto } from './account-response.dto';

/**
 * Thao tác trên tài khoản dùng chung cho SV và GV (UCADM09, S24) — chỉ ADMIN.
 * Route theo SRS mục X (đã gộp về `/users/:id/...`, chốt 14/11/2026).
 */
@Controller('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AccountActionsController {
  constructor(
    private readonly setAccountActive: SetAccountActiveUseCase,
    private readonly resendTemporaryPassword: ResendTemporaryPasswordUseCase,
    private readonly changeAccountRole: ChangeAccountRoleUseCase,
  ) {}

  @Post(':id/lock')
  @ApiOkResponse({ type: AccountResponseDto })
  @HttpCode(HttpStatus.OK)
  lock(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<AccountView> {
    return this.setAccountActive.execute({
      actorId: actor.sub,
      targetId: id,
      isActive: false,
    });
  }

  @Post(':id/unlock')
  @ApiOkResponse({ type: AccountResponseDto })
  @HttpCode(HttpStatus.OK)
  unlock(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<AccountView> {
    return this.setAccountActive.execute({
      actorId: actor.sub,
      targetId: id,
      isActive: true,
    });
  }

  @Post(':id/resend-temporary-password')
  @ApiOkResponse({ type: AccountResponseDto })
  @HttpCode(HttpStatus.OK)
  resend(@Param('id', new ParseUUIDPipe()) id: string): Promise<AccountView> {
    return this.resendTemporaryPassword.execute(id);
  }

  @Patch(':id/role')
  @ApiOkResponse({ type: AccountResponseDto })
  changeRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<AccountView> {
    return this.changeAccountRole.execute({
      actorId: actor.sub,
      targetId: id,
      role: dto.role,
    });
  }
}
