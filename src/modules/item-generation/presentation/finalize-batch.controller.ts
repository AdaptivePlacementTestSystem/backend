import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type JwtPayload,
} from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { DecideFlagUseCase } from '../application/decide-flag.use-case';
import type { FlagDecision } from '../application/decide-flag.use-case';
import { FinalCheckBatchUseCase } from '../application/final-check-batch.use-case';
import { ImportBatchUseCase } from '../application/import-batch.use-case';
import { RefreshBatchStatusUseCase } from '../application/refresh-batch-status.use-case';

@Controller('item-batches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinalizeBatchController {
  constructor(
    private readonly refreshStatus: RefreshBatchStatusUseCase,
    private readonly finalCheck: FinalCheckBatchUseCase,
    private readonly decideFlag: DecideFlagUseCase,
    private readonly importBatch: ImportBatchUseCase,
  ) {}

  @Post(':id/refresh-status')
  @Roles(UserRole.ADMIN)
  refresh(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.refreshStatus.execute(id);
  }

  @Post(':id/final-check')
  @Roles(UserRole.ADMIN)
  check(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.finalCheck.execute(id);
  }

  @Post(':id/items/:itemId/flag-decision')
  @Roles(UserRole.ADMIN)
  decide(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { decision: FlagDecision },
  ) {
    return this.decideFlag.execute(id, itemId, user.sub, body?.decision);
  }

  @Post(':id/import')
  @Roles(UserRole.ADMIN)
  import(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.importBatch.execute(id, user.sub);
  }
}
