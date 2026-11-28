import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
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
export class ConfirmItemUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    teacherId: string,
    itemId: string,
    action: 'CONFIRM' | 'REMOVE',
    comment?: string,
  ): Promise<{
    success: boolean;
    itemId: string;
    status: ItemStatus;
    batchFinalized: boolean;
  }> {
    const trimmedComment = comment?.trim() || null;
    if (action === 'REMOVE' && !trimmedComment) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Vui lòng nhập lý do loại bỏ câu hỏi',
      });
    }

    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      include: {
        batch: { select: { id: true, status: true, confirmerId: true } },
      },
    });

    if (!item) {
      throw new NotFoundException(`Không tìm thấy câu hỏi: ${itemId}`);
    }

    // WP-2.1: Kiểm tra quyền GV vai B dựa trên ItemBatch.confirmerId & batch.status === IN_REVIEW
    if (item.batch?.confirmerId !== teacherId) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_ASSIGNED,
        message: 'Bạn không được phân công xác nhận câu hỏi này (NOT_ASSIGNED)',
      });
    }

    if (item.batch?.status !== ItemBatchStatus.IN_REVIEW) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'Lô câu hỏi không còn ở trạng thái đang duyệt (IN_REVIEW).',
      });
    }

    if (item.status !== ItemStatus.FIRST_APPROVED) {
      throw new BadRequestException(
        'Câu hỏi này chưa qua duyệt vòng 1 hoặc đã có quyết định thẩm định',
      );
    }

    const nextStatus =
      action === 'CONFIRM' ? ItemStatus.SECOND_APPROVED : ItemStatus.REJECTED;
    const reviewAction =
      action === 'CONFIRM' ? ReviewAction.CONFIRM : ReviewAction.REMOVE;

    const secondReview = (item.secondReview as Record<string, any>) || {};
    const updatedSecondReview = {
      ...secondReview,
      action: reviewAction,
      confirmedAt: new Date().toISOString(),
      comment: trimmedComment,
    };

    let batchFinalized = false;

    await this.prisma.$transaction(async (tx) => {
      await lockAndAssertBatchInReview(tx, item.batchId, teacherId);

      // 1. Cập nhật câu hỏi có kiểm tra điều kiện nguyên tử chống ghi đè đồng thời với reassign-confirmer
      const updateResult = await tx.item.updateMany({
        where: {
          id: itemId,
          status: ItemStatus.FIRST_APPROVED,
          batch: {
            confirmerId: teacherId,
            status: ItemBatchStatus.IN_REVIEW,
          },
        },
        data: {
          status: nextStatus,
          secondReview: updatedSecondReview,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message:
            'Câu hỏi đã được xử lý hoặc bạn không còn được phân công thẩm định câu hỏi này.',
        });
      }

      // 2. Ghi nhật ký kiểm toán
      await tx.itemReviewEvent.create({
        data: {
          batchId: item.batchId,
          itemId: item.id,
          actorId: teacherId,
          action: reviewAction,
          ...(trimmedComment ? { details: { comment: trimmedComment } } : {}),
        },
      });

      // 3. WP-6.1: Chốt lô -> READY_TO_FINALIZE nếu có SECOND_APPROVED, ngược lại DONE
      batchFinalized = await finalizeBatchIfNoPending(tx, item.batchId, itemId);
    });

    return {
      success: true,
      itemId: item.id,
      status: nextStatus,
      batchFinalized,
    };
  }
}
