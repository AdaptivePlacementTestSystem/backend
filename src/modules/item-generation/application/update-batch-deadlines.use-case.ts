import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

type DeadlineRequest = { firstDueAt: string; secondDueAt: string };
function reviewWithDue(
  value: Prisma.JsonValue | null,
  dueAt: string,
): Prisma.InputJsonObject {
  const old =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return { ...old, dueAt } as Prisma.InputJsonObject;
}
@Injectable()
export class UpdateBatchDeadlinesUseCase {
  constructor(private readonly prisma: PrismaService) {}
  async execute(batchId: string, input: DeadlineRequest) {
    if (
      !input ||
      typeof input.firstDueAt !== 'string' ||
      typeof input.secondDueAt !== 'string'
    )
      throw new BadRequestException('Cần ngày giờ cho hai vòng');
    const first = new Date(input.firstDueAt),
      second = new Date(input.secondDueAt);
    if (
      !Number.isFinite(first.getTime()) ||
      !Number.isFinite(second.getTime()) ||
      first <= new Date() ||
      second <= first
    )
      throw new BadRequestException(
        'Hạn A phải ở tương lai và hạn B sau hạn A',
      );
    return this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.itemBatch.findUnique({
          where: { id: batchId },
          select: { status: true },
        });
        if (!batch) throw new NotFoundException('Không tìm thấy lô');
        if (batch.status !== 'IN_REVIEW')
          throw new ConflictException('Chỉ chỉnh hạn lô đang duyệt');
        const items = await tx.item.findMany({
          where: {
            batchId,
            reviewerId: { not: null },
            confirmerId: { not: null },
          },
          select: {
            id: true,
            status: true,
            firstReview: true,
            secondReview: true,
          },
        });
        if (!items.length) throw new ConflictException('Lô chưa có phân công');
        for (const item of items) {
          const data: Prisma.ItemUpdateInput = {};
          if (item.status === 'DRAFT') {
            data.firstReview = reviewWithDue(
              item.firstReview,
              first.toISOString(),
            );
            data.firstReminderSent = false;
          }
          if (item.status === 'DRAFT' || item.status === 'FIRST_APPROVED') {
            data.secondReview = reviewWithDue(
              item.secondReview,
              second.toISOString(),
            );
            data.secondReminderSent = false;
          }
          if (Object.keys(data).length)
            await tx.item.update({ where: { id: item.id }, data });
        }
        return {
          firstDueAt: first.toISOString(),
          secondDueAt: second.toISOString(),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
