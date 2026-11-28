import {
  cancelResponse,
  refreshResponse,
  finalCheckResponse,
  finalReportResponse,
  flagDecisionResponse,
  importResponse,
} from './admin-batch-response.schemas';
import { ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
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
import { CancelPendingUseCase } from '../application/cancel-pending.use-case';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

@Controller('item-batches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FinalizeBatchController {
  constructor(
    private readonly refreshStatus: RefreshBatchStatusUseCase,
    private readonly finalCheck: FinalCheckBatchUseCase,
    private readonly decideFlag: DecideFlagUseCase,
    private readonly importBatch: ImportBatchUseCase,
    private readonly cancelPending: CancelPendingUseCase,
    private readonly prisma: PrismaService,
  ) {}

  @ApiCreatedResponse({ schema: cancelResponse })
  @Post(':id/cancel-pending')
  @Roles(UserRole.ADMIN)
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { reason?: unknown },
  ) {
    return this.cancelPending.execute(id, user.sub, body?.reason);
  }

  @ApiCreatedResponse({ schema: refreshResponse })
  @Post(':id/refresh-status')
  @Roles(UserRole.ADMIN)
  refresh(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.refreshStatus.execute(id);
  }

  @ApiCreatedResponse({ schema: finalCheckResponse })
  @Post(':id/final-check')
  @Roles(UserRole.ADMIN)
  check(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.finalCheck.execute(id);
  }

  @ApiOkResponse({ schema: finalReportResponse })
  @Get(':id/final-check')
  @Roles(UserRole.ADMIN)
  async report(@Param('id', new ParseUUIDPipe()) id: string) {
    const batch = await this.prisma.itemBatch.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!batch) throw new NotFoundException('Không tìm thấy lô');
    const [items, changedBank] = await Promise.all([
      this.prisma.item.findMany({
        where: {
          batchId: id,
          status: { in: ['SECOND_APPROVED', 'FINAL_APPROVED', 'AI_REJECTED'] },
        },
        select: {
          id: true,
          status: true,
          contentHash: true,
          checkResults: {
            where: { checkpoint: 'C3' },
            select: {
              contentHash: true,
              level: true,
              reasonCodes: true,
              checkedAt: true,
              suspectedDuplicateId: true,
            },
            orderBy: { checkedAt: 'desc' },
          },
        },
      }),
      this.prisma.item.findFirst({
        where: {
          status: 'FINAL_APPROVED',
          approvedAt: { not: null },
          batchId: { not: id },
        },
        select: { approvedAt: true },
        orderBy: { approvedAt: 'desc' },
      }),
    ]);
    const eligibleState = [
      'FINAL_CHECKED',
      'PARTIALLY_IMPORTED',
      'DONE',
    ].includes(batch.status);
    const rows = items.map(({ contentHash, checkResults, ...item }) => {
      const matching = checkResults.filter(
        (check) => check.contentHash === contentHash,
      );
      const marker = matching.find((check) =>
        check.reasonCodes.includes('INDEPENDENT_ANSWER_CHECKED'),
      );
      return {
        ...item,
        stale:
          item.status === 'SECOND_APPROVED' &&
          (!marker ||
            !eligibleState ||
            !!(
              changedBank?.approvedAt &&
              marker.checkedAt < changedBank.approvedAt
            )),
        checks: marker
          ? matching.filter((check) => check.checkedAt >= marker.checkedAt)
          : matching,
      };
    });
    return {
      batchId: id,
      status: batch.status,
      stale: !eligibleState || rows.some((row) => row.stale),
      items: rows,
    };
  }

  @ApiCreatedResponse({ schema: flagDecisionResponse })
  @Post(':id/items/:itemId/flag-decision')
  @Roles(UserRole.ADMIN)
  decide(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { decision: FlagDecision; comment?: string },
  ) {
    return this.decideFlag.execute(
      id,
      itemId,
      user.sub,
      body?.decision,
      body?.comment,
    );
  }

  @ApiCreatedResponse({ schema: importResponse })
  @Post(':id/import')
  @Roles(UserRole.ADMIN)
  import(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.importBatch.execute(id, user.sub);
  }
}
