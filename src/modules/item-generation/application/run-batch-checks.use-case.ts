import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CheckExactDuplicatesUseCase } from './check-exact-duplicates.use-case';
import { CheckNearDuplicatesUseCase } from './check-near-duplicates.use-case';
import { CheckSemanticDuplicatesUseCase } from './check-semantic-duplicates.use-case';
import { CheckIndependentAnswerUseCase } from './check-independent-answer.use-case';
import { assertJobLease, type JobLease } from '../infrastructure/job-lease';

/** Chạy T1, T2, T3 theo thứ tự rồi chuyển lô CHECKING sang READY_TO_ASSIGN (hoặc FAILED nếu không còn câu nào). */
@Injectable()
export class RunBatchChecksUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly t1: CheckExactDuplicatesUseCase,
    private readonly t2: CheckNearDuplicatesUseCase,
    private readonly t3: CheckSemanticDuplicatesUseCase,
    private readonly g5: CheckIndependentAnswerUseCase,
  ) {}

  async execute(
    batchId: string,
    checkpoint: 'C1' | 'C2' = 'C1',
    lease?: JobLease,
  ) {
    if (lease && lease.batchId !== batchId) throw new Error('JOB_BATCH_MISMATCH');
    const exact = await this.t1.execute(batchId, checkpoint, lease);
    const near = await this.t2.execute(batchId, checkpoint, undefined, lease);
    const semantic = await this.t3.execute(batchId, checkpoint, lease);
    if (semantic.skipped)
      throw new ServiceUnavailableException(
        'Chưa cấu hình kiểm tra trùng ngữ nghĩa T3; hãy cấu hình AI và thử lại',
      );
    const answer = await this.g5.execute(batchId, checkpoint, lease);
    const remaining = await this.prisma.item.count({
      where: { batchId, status: 'DRAFT' },
    });
    const status = remaining > 0 ? 'READY_TO_ASSIGN' : 'FAILED';
    const update = (client: Pick<PrismaService, 'itemBatch'>) =>
      client.itemBatch.updateMany({
        where: { id: batchId, status: 'CHECKING' },
        data: { status },
      });
    const changed = lease
      ? await this.prisma.$transaction(async (tx) => {
          await assertJobLease(tx, lease);
          return update(tx);
        })
      : await update(this.prisma);
    if (changed.count !== 1)
      throw new ConflictException(
        'Trạng thái lô đã thay đổi; vui lòng tải lại',
      );
    return {
      status,
      remaining,
      exactRejected: exact.rejected,
      nearRejected: near.rejected,
      nearFlagged: near.flagged,
      semanticSkipped: semantic.skipped,
      semanticFlagged: semantic.flagged,
      answerFlagged: answer.flagged,
    };
  }
}
