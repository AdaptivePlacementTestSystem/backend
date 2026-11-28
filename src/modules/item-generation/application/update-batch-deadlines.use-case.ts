import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

type DeadlineRequest = {
  firstDueAt: string;
  secondDueAt: string;
  reason: string;
};
function dueOf(value: Prisma.JsonValue | null): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return typeof value.dueAt === 'string' ? value.dueAt : null;
}
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
  async execute(batchId: string, actorId: string, input: DeadlineRequest) {
    if (
      !input ||
      typeof input.firstDueAt !== 'string' ||
      typeof input.secondDueAt !== 'string' ||
      typeof input.reason !== 'string' ||
      !input.reason.trim()
    )
      throw new BadRequestException(
        'Cần ngày giờ cho hai vòng và lý do đổi hạn',
      );
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
          select: { status: true, confirmerId: true },
        });
        if (!batch) throw new NotFoundException('Không tìm thấy lô');
        if (batch.status !== 'IN_REVIEW')
          throw new ConflictException('Chỉ chỉnh hạn lô đang duyệt');
        if (!batch.confirmerId)
          throw new ConflictException('Lô chưa có giảng viên xác nhận');
        const items = await tx.item.findMany({
          where: {
            batchId,
            reviewerId: { not: null },
            status: { in: ['DRAFT', 'FIRST_APPROVED'] },
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
        await tx.itemReviewEvent.create({
          data: {
            batchId,
            itemId: null,
            actorId,
            action: 'UPDATE_DUE_DATE',
            details: {
              reason: input.reason.trim(),
              actorId,
              updatedCount: items.length,
              itemIds: items.map((item) => item.id),
              oldDueDates: items.map((item) => ({
                itemId: item.id,
                firstDueAt:
                  item.status === 'DRAFT' ? dueOf(item.firstReview) : null,
                secondDueAt: dueOf(item.secondReview),
              })),
              newDueDates: {
                firstDueAt: first.toISOString(),
                secondDueAt: second.toISOString(),
              },
            },
          },
        });
        return {
          firstDueAt: first.toISOString(),
          secondDueAt: second.toISOString(),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
