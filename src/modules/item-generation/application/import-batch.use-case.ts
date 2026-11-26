import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

/**
 * Import vào ngân hàng: SECOND_APPROVED -> FINAL_APPROVED (approved_by, approved_at, calibrated=false).
 * Chặn khi còn câu có cờ mềm C3 chưa được Admin quyết định. Lô -> DONE; không câu nào được import thì -> FAILED.
 */
@Injectable()
export class ImportBatchUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(batchId: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.itemBatch.findUnique({
          where: { id: batchId },
          select: { status: true },
        });
        if (!batch) throw new NotFoundException('Không tìm thấy lô');
        if (batch.status !== 'FINAL_CHECKED')
          throw new ConflictException('Chỉ import lô đã kiểm lần cuối');
        const items = await tx.item.findMany({
          where: { batchId, status: 'SECOND_APPROVED' },
          select: { id: true },
        });
        const ids = items.map((i) => i.id);
        const flagged = ids.length
          ? await tx.itemCheckResult.findMany({
              where: { itemId: { in: ids }, checkpoint: 'C3', level: 'SOFT' },
              select: { itemId: true },
              distinct: ['itemId'],
            })
          : [];
        const accepted = flagged.length
          ? await tx.itemReviewEvent.findMany({
              where: {
                itemId: { in: flagged.map((f) => f.itemId) },
                action: 'ACCEPT_FLAG',
              },
              select: { itemId: true },
            })
          : [];
        const acceptedSet = new Set(accepted.map((a) => a.itemId));
        const pending = flagged.filter((f) => !acceptedSet.has(f.itemId));
        if (pending.length)
          throw new ConflictException(
            `Còn ${pending.length} câu có cờ mềm chưa được quyết định`,
          );
        const now = new Date();
        if (ids.length) {
          await tx.item.updateMany({
            where: { id: { in: ids }, status: 'SECOND_APPROVED' },
            data: {
              status: 'FINAL_APPROVED',
              approvedById: actorId,
              approvedAt: now,
              calibrated: false,
            },
          });
          await tx.itemReviewEvent.createMany({
            data: ids.map((itemId) => ({
              batchId,
              itemId,
              actorId,
              action: 'IMPORT' as const,
            })),
          });
        }
        const status = ids.length ? 'DONE' : 'FAILED';
        await tx.itemBatch.update({ where: { id: batchId }, data: { status } });
        return { status, imported: ids.length };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
