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
  ReassignBatchUseCase,
  type ReassignRequest,
} from '../application/reassign-batch.use-case';
import { AssignmentPreviewUseCase } from '../application/assignment-preview.use-case';
import { ReassignConfirmerUseCase } from '../application/reassign-confirmer.use-case';
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
    private readonly reassignBatch: ReassignBatchUseCase,
    private readonly preview: AssignmentPreviewUseCase,
    private readonly reassignConfirmer: ReassignConfirmerUseCase,
  ) {}
  @Post(':id/reassign-confirmer')
  @Roles(UserRole.ADMIN)
  changeConfirmer(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: JwtPayload, @Body() body: { toConfirmerId?: unknown; reason?: unknown }) {
    return this.reassignConfirmer.execute(id, user.sub, body);
  }
  @Post(':id/assign-preview')
  @Roles(UserRole.ADMIN)
  previewAssignment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { reviewerIds?: unknown },
  ) {
    return this.preview.execute(id, body?.reviewerIds);
  }
  @Patch(':id/deadlines')
  @Roles(UserRole.ADMIN)
  deadlines(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { firstDueAt: string; secondDueAt: string; reason: string },
  ) {
    return this.updateDeadlines.execute(id, user.sub, body);
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
  @Post(':id/reassign')
  @Roles(UserRole.ADMIN)
  reassign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: ReassignRequest,
  ) {
    return this.reassignBatch.execute(id, user.sub, body);
  }
}
