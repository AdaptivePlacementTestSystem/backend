import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import {
  ItemStatus,
  ReviewAction,
  ItemBatchStatus,
  ErrorCode,
} from '@apt/shared-types';
import {
  finalizeBatchIfNoPending,
  lockAndAssertBatchInReview,
} from './batch-review-helper';

@Injectable()
export class ConfirmAllItemsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    teacherId: string,
    batchId: string,
  ): Promise<{
    success: boolean;
    confirmedCount: number;
    batchFinalized: boolean;
  }> {
    const batch = await this.prisma.itemBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Không tìm thấy lô câu hỏi: ${batchId}`);
    }

    // WP-2.1: Nguồn sự thật GV vai B nằm ở ItemBatch.confirmerId & batch.status === IN_REVIEW
    if (batch.confirmerId !== teacherId) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_ASSIGNED,
        message:
          'Bạn không được phân công xác nhận câu hỏi trong lô này (NOT_ASSIGNED)',
      });
    }

    if (batch.status !== ItemBatchStatus.IN_REVIEW) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'Lô câu hỏi không còn ở trạng thái đang duyệt (IN_REVIEW).',
      });
    }

    // Lấy tất cả câu FIRST_APPROVED trong lô (theo batchId, bỏ item.confirmerId)
    const pendingItems = await this.prisma.item.findMany({
      where: {
        batchId,
        status: ItemStatus.FIRST_APPROVED,
      },
    });

    if (pendingItems.length === 0) {
      return { success: true, confirmedCount: 0, batchFinalized: false };
    }

    const nowIso = new Date().toISOString();
    let batchFinalized = false;
    let actualConfirmedCount = 0;
    const confirmedItemIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      await lockAndAssertBatchInReview(tx, batchId, teacherId);

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
            status: ItemStatus.FIRST_APPROVED,
            batch: {
              confirmerId: teacherId,
              status: ItemBatchStatus.IN_REVIEW,
            },
          },
          data: {
            status: ItemStatus.SECOND_APPROVED,
            secondReview: updatedSecondReview,
          },
        });
        if (res.count > 0) {
          actualConfirmedCount += res.count;
          confirmedItemIds.push(item.id);
        }
      }

      // 2. Ghi một dòng log kiểm toán hàng loạt mức Lô (itemId = null) kèm details theo Q3/Q8
      if (actualConfirmedCount > 0) {
        await tx.itemReviewEvent.create({
          data: {
            batchId,
            itemId: null,
            actorId: teacherId,
            action: ReviewAction.CONFIRM_ALL,
            details: {
              updatedCount: actualConfirmedCount,
              itemIds: confirmedItemIds,
            },
          },
        });
      }

      // 3. WP-6.1: Chốt lô -> READY_TO_FINALIZE nếu có SECOND_APPROVED, ngược lại DONE
      batchFinalized = await finalizeBatchIfNoPending(tx, batchId);
    });

    return {
      success: true,
      confirmedCount: actualConfirmedCount,
      batchFinalized,
    };
  }
}
