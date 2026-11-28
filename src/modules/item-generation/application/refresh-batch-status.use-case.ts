import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class RefreshBatchStatusUseCase {
  constructor(private readonly prisma: PrismaService) {}
  async execute(batchId: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const batch = await tx.itemBatch.findUnique({
            where: { id: batchId },
            select: { status: true },
          });
          if (!batch) throw new NotFoundException('Không tìm thấy lô');
          if (batch.status !== 'IN_REVIEW')
            return { status: batch.status, changed: false };
          const [open, approved, total] = await Promise.all([
            tx.item.count({
              where: { batchId, status: { in: ['DRAFT', 'FIRST_APPROVED'] } },
            }),
            tx.item.count({ where: { batchId, status: 'SECOND_APPROVED' } }),
            tx.item.count({ where: { batchId } }),
          ]);
          if (open > 0 || total === 0)
            return { status: batch.status, changed: false, open, approved };
          const status = approved ? 'READY_TO_FINALIZE' : 'DONE';
          const result = await tx.itemBatch.updateMany({
            where: { id: batchId, status: 'IN_REVIEW' },
            data: { status },
          });
          if (result.count !== 1)
            throw new ConflictException('Trạng thái lô đã thay đổi');
          return { status, changed: true, open, approved };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      )
        throw new ConflictException('Trạng thái lô đã thay đổi');
      throw error;
    }
  }
}
