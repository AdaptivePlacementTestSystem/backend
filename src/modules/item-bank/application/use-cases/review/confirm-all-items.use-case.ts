import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { ItemStatus, ReviewAction, ItemBatchStatus } from '@apt/shared-types';

@Injectable()
export class ConfirmAllItemsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    teacherId: string,
    batchId: string,
  ): Promise<{ success: boolean; confirmedCount: number; batchFinalized: boolean }> {
    const batch = await this.prisma.itemBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Không tìm thấy lô câu hỏi: ${batchId}`);
    }

    // Lấy tất cả câu FIRST_APPROVED được giao cho GV B trong lô này
    const pendingItems = await this.prisma.item.findMany({
      where: {
        batchId,
        confirmerId: teacherId,
        status: ItemStatus.FIRST_APPROVED,
      },
    });

    if (pendingItems.length === 0) {
      // Kiểm tra xem GV có quyền confirmer trong lô này không
      const anyAssigned = await this.prisma.item.findFirst({
        where: { batchId, confirmerId: teacherId },
      });
      if (!anyAssigned) {
        throw new ForbiddenException('Bạn không được phân công xác nhận câu hỏi trong lô này (NOT_ASSIGNED)');
      }
      return { success: true, confirmedCount: 0, batchFinalized: false };
    }

    const nowIso = new Date().toISOString();
    let batchFinalized = false;
    let actualConfirmedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      // 1. Cập nhật tất cả các câu chưa quyết định thành SECOND_APPROVED có điều kiện nguyên tử
      for (const item of pendingItems) {
        const secondReview = (item.secondReview as Record<string, any>) || {};
        const updatedSecondReview = {
          ...secondReview,
          action: ReviewAction.CONFIRM,
          confirmedAt: nowIso,
          comment: 'Xác nhận hàng loạt theo lô (CONFIRM_ALL)',
        };

        const res = await tx.item.updateMany({
          where: {
            id: item.id,
            confirmerId: teacherId,
            status: ItemStatus.FIRST_APPROVED,
          },
          data: {
            status: ItemStatus.SECOND_APPROVED,
            secondReview: updatedSecondReview,
          },
        });
        actualConfirmedCount += res.count;
      }

      // 2. Ghi một dòng log kiểm toán hàng loạt mức Lô (itemId = null) nếu có ít nhất 1 câu được xác nhận
      if (actualConfirmedCount > 0) {
        await tx.itemReviewEvent.create({
          data: {
            batchId,
            itemId: null,
            actorId: teacherId,
            action: ReviewAction.CONFIRM_ALL,
          },
        });
      }

      // 3. Kiểm tra xem lô đã xong toàn bộ chưa
      const remainingUnfinished = await tx.item.count({
        where: {
          batchId,
          status: {
            in: [ItemStatus.DRAFT, ItemStatus.FIRST_APPROVED],
          },
        },
      });

      if (remainingUnfinished === 0) {
        await tx.itemBatch.update({
          where: { id: batchId },
          data: { status: ItemBatchStatus.READY_TO_FINALIZE },
        });
        batchFinalized = true;
      }
    });

    return {
      success: true,
      confirmedCount: actualConfirmedCount,
      batchFinalized,
    };
  }
}
