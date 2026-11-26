import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { UpdateBatchDeadlinesUseCase } from '../application/update-batch-deadlines.use-case';
import {
  AssignBatchUseCase,
  type AssignRequest,
} from '../application/assign-batch.use-case';

@Controller('item-batches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignBatchController {
  constructor(
    private readonly assignBatch: AssignBatchUseCase,
    private readonly updateDeadlines: UpdateBatchDeadlinesUseCase,
  ) {}
  @Patch(':id/deadlines')
  @Roles(UserRole.ADMIN)
  deadlines(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { firstDueAt: string; secondDueAt: string },
  ) {
    return this.updateDeadlines.execute(id, body);
  }
  @Post(':id/assign')
  @Roles(UserRole.ADMIN)
  assign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: AssignRequest,
  ) {
    return this.assignBatch.execute(id, user.sub, body);
  }
}
