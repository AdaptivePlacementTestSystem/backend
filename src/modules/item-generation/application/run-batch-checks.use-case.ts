import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CheckExactDuplicatesUseCase } from './check-exact-duplicates.use-case';
import { CheckNearDuplicatesUseCase } from './check-near-duplicates.use-case';
import { CheckSemanticDuplicatesUseCase } from './check-semantic-duplicates.use-case';

/** Chạy T1, T2, T3 theo thứ tự rồi chuyển lô CHECKING sang READY_TO_ASSIGN (hoặc FAILED nếu không còn câu nào). */
@Injectable()
export class RunBatchChecksUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly t1: CheckExactDuplicatesUseCase,
    private readonly t2: CheckNearDuplicatesUseCase,
    private readonly t3: CheckSemanticDuplicatesUseCase,
  ) {}

  async execute(batchId: string, checkpoint: 'C1' | 'C2' = 'C1') {
    const exact = await this.t1.execute(batchId, checkpoint);
    const near = await this.t2.execute(batchId, checkpoint);
    const semantic = await this.t3.execute(batchId, checkpoint);
    const remaining = await this.prisma.item.count({
      where: { batchId, status: 'DRAFT' },
    });
    const status = remaining > 0 ? 'READY_TO_ASSIGN' : 'FAILED';
    await this.prisma.itemBatch.updateMany({
      where: { id: batchId, status: 'CHECKING' },
      data: { status },
    });
    return {
      status,
      remaining,
      exactRejected: exact.rejected,
      nearRejected: near.rejected,
      nearFlagged: near.flagged,
      semanticSkipped: semantic.skipped,
      semanticFlagged: semantic.flagged,
    };
  }
}
