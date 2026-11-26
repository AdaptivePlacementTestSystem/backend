import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

/**
 * Tự chuyển trạng thái lô theo trạng thái các câu.
 * IN_REVIEW -> READY_TO_FINALIZE khi không còn câu DRAFT/FIRST_APPROVED và có ít nhất một câu SECOND_APPROVED.
 * Các bước khác do use case tương ứng đảm nhiệm (CHECKING -> READY_TO_ASSIGN: RunBatchChecks; READY_TO_ASSIGN -> IN_REVIEW: AssignBatch;
 * READY_TO_FINALIZE -> FINAL_CHECKED: FinalCheckBatch; FINAL_CHECKED -> DONE/FAILED: ImportBatch).
 */
@Injectable()
export class RefreshBatchStatusUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(batchId: string) {
    const batch = await this.prisma.itemBatch.findUnique({
      where: { id: batchId },
      select: { status: true },
    });
    if (!batch) throw new NotFoundException('Không tìm thấy lô');
    if (batch.status !== 'IN_REVIEW') return { status: batch.status, changed: false };
    const [open, approved] = await Promise.all([
      this.prisma.item.count({
        where: { batchId, status: { in: ['DRAFT', 'FIRST_APPROVED'] } },
      }),
      this.prisma.item.count({ where: { batchId, status: 'SECOND_APPROVED' } }),
    ]);
    if (open > 0 || approved === 0)
      return { status: batch.status, changed: false, open, approved };
    const res = await this.prisma.itemBatch.updateMany({
      where: { id: batchId, status: 'IN_REVIEW' },
      data: { status: 'READY_TO_FINALIZE' },
    });
    return {
      status: res.count ? 'READY_TO_FINALIZE' : batch.status,
      changed: res.count > 0,
      open,
      approved,
    };
  }
}
