import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class CancelPendingUseCase {
  constructor(private readonly prisma: PrismaService) {}
  async execute(batchId: string, actorId: string, reason: unknown) {
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500)
      throw new BadRequestException('Cần lý do hủy không quá 500 ký tự');
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const batch = await tx.itemBatch.findUnique({
            where: { id: batchId },
            select: { status: true },
          });
          if (!batch) throw new NotFoundException('Không tìm thấy lô');
          if (batch.status !== 'IN_REVIEW')
            throw new ConflictException('Lô không ở trạng thái đang duyệt');
          const pending = await tx.item.findMany({
            where: { batchId, status: { in: ['DRAFT', 'FIRST_APPROVED'] } },
            select: { id: true, status: true },
          });
          if (!pending.length)
            throw new ConflictException('Không còn câu chờ duyệt để hủy');
          const ids = pending.map((item) => item.id);
          const changed = await tx.item.updateMany({
            where: {
              batchId,
              id: { in: ids },
              status: { in: ['DRAFT', 'FIRST_APPROVED'] },
            },
            data: { status: 'REJECTED' },
          });
          if (changed.count !== ids.length)
            throw new ConflictException('Danh sách câu đã thay đổi');
          const counts = {
            DRAFT: pending.filter((item) => item.status === 'DRAFT').length,
            FIRST_APPROVED: pending.filter(
              (item) => item.status === 'FIRST_APPROVED',
            ).length,
          };
          await tx.itemReviewEvent.create({
            data: {
              batchId,
              itemId: null,
              actorId,
              action: 'CANCEL_PENDING',
              details: {
                reason: reason.trim(),
                itemIds: ids,
                counts,
                updatedCount: ids.length,
              },
            },
          });
          const approved = await tx.item.count({
            where: { batchId, status: 'SECOND_APPROVED' },
          });
          const status = approved ? 'READY_TO_FINALIZE' : 'DONE';
          const updated = await tx.itemBatch.updateMany({
            where: { id: batchId, status: 'IN_REVIEW' },
            data: { status },
          });
          if (updated.count !== 1)
            throw new ConflictException('Trạng thái lô đã thay đổi');
          return { cancelled: ids.length, counts, status };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      )
        throw new ConflictException('Lô đã thay đổi; vui lòng tải lại');
      throw error;
    }
  }
}
