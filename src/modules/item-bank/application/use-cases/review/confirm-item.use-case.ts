import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { ItemStatus, ReviewAction, ItemBatchStatus } from '@apt/shared-types';

@Injectable()
export class ConfirmItemUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    teacherId: string,
    itemId: string,
    action: 'CONFIRM' | 'REMOVE',
    comment?: string,
  ): Promise<{ success: boolean; itemId: string; status: ItemStatus; batchFinalized: boolean }> {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundException(`Không tìm thấy câu hỏi: ${itemId}`);
    }

    if (item.confirmerId !== teacherId) {
      throw new ForbiddenException('Bạn không được phân công xác nhận câu hỏi này (NOT_ASSIGNED)');
    }

    if (item.status !== ItemStatus.FIRST_APPROVED) {
      throw new BadRequestException('Câu hỏi này chưa qua duyệt vòng 1 hoặc đã có quyết định thẩm định');
    }

    const nextStatus = action === 'CONFIRM' ? ItemStatus.SECOND_APPROVED : ItemStatus.REJECTED;
    const reviewAction = action === 'CONFIRM' ? ReviewAction.CONFIRM : ReviewAction.REMOVE;

    const secondReview = (item.secondReview as Record<string, any>) || {};
    const updatedSecondReview = {
      ...secondReview,
      action: reviewAction,
      confirmedAt: new Date().toISOString(),
      comment: comment?.trim() || null,
    };

    let batchFinalized = false;

    await this.prisma.$transaction(async (tx) => {
      // 1. Cập nhật câu hỏi
      await tx.item.update({
        where: { id: itemId },
        data: {
          status: nextStatus,
          secondReview: updatedSecondReview,
        },
      });

      // 2. Ghi nhật ký kiểm toán
      await tx.itemReviewEvent.create({
        data: {
          batchId: item.batchId,
          itemId: item.id,
          actorId: teacherId,
          action: reviewAction,
        },
      });

      // 3. Kiểm tra xem toàn bộ các câu trong lô đã hoàn tất vòng 2 chưa
      const remainingUnfinished = await tx.item.count({
        where: {
          batchId: item.batchId,
          id: { not: itemId },
          status: {
            in: [ItemStatus.DRAFT, ItemStatus.FIRST_APPROVED],
          },
        },
      });

      if (remainingUnfinished === 0) {
        await tx.itemBatch.update({
          where: { id: item.batchId },
          data: { status: ItemBatchStatus.READY_TO_FINALIZE },
        });
        batchFinalized = true;
      }
    });

    return {
      success: true,
      itemId: item.id,
      status: nextStatus,
      batchFinalized,
    };
  }
}
