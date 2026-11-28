import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
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
export class ReviewItemUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    teacherId: string,
    itemId: string,
    action: 'APPROVE' | 'REJECT',
    comment?: string,
  ): Promise<{
    success: boolean;
    itemId: string;
    status: ItemStatus;
    batchFinalized: boolean;
  }> {
    const trimmedComment = comment?.trim() || null;
    if (action === 'REJECT' && !trimmedComment) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Vui lòng nhập lý do từ chối câu hỏi',
      });
    }

    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      include: {
        batch: { select: { id: true, status: true } },
      },
    });

    if (!item) {
      throw new NotFoundException(`Không tìm thấy câu hỏi: ${itemId}`);
    }

    if (item.reviewerId !== teacherId) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_ASSIGNED,
        message: 'Bạn không được phân công duyệt câu hỏi này (NOT_ASSIGNED)',
      });
    }

    if (item.batch?.status !== ItemBatchStatus.IN_REVIEW) {
      throw new ConflictException({
        code: ErrorCode.CONFLICT,
        message: 'Lô câu hỏi không còn ở trạng thái đang duyệt (IN_REVIEW).',
      });
    }

    if (item.status !== ItemStatus.DRAFT) {
      throw new BadRequestException(
        'Câu hỏi này đã có quyết định, không thể duyệt lại',
      );
    }

    // BR-27: Chặn duyệt nếu câu sau sửa bị trùng lặp (T1 check) hoặc không hợp lệ
    if (action === 'APPROVE') {
      if (item.contentHash) {
        const duplicate = await this.prisma.item.findFirst({
          where: {
            id: { not: itemId },
            contentHash: item.contentHash,
            status: { notIn: [ItemStatus.REJECTED, ItemStatus.AI_REJECTED] },
          },
          select: { id: true },
        });

        if (duplicate) {
          throw new UnprocessableEntityException({
            code: ErrorCode.DUPLICATE_AFTER_EDIT,
            message:
              'Câu hỏi sau khi sửa bị trùng lặp với câu hỏi khác trong ngân hàng. Không thể duyệt.',
          });
        }
      }

      const opts = item.options as Record<string, string> | null;
      if (
        !item.content?.trim() ||
        !opts?.A?.trim() ||
        !opts?.B?.trim() ||
        !opts?.C?.trim() ||
        !opts?.D?.trim()
      ) {
        throw new UnprocessableEntityException({
          code: ErrorCode.INVALID_AFTER_EDIT,
          message: 'Bản sửa không hợp lệ hoặc thiếu dữ liệu, không thể duyệt.',
        });
      }
    }

    const nextStatus =
      action === 'APPROVE' ? ItemStatus.FIRST_APPROVED : ItemStatus.REJECTED;
    const reviewAction =
      action === 'APPROVE' ? ReviewAction.APPROVE : ReviewAction.REJECT;

    const firstReview = (item.firstReview as Record<string, any>) || {};
    const updatedFirstReview = {
      ...firstReview,
      action: reviewAction,
      reviewedAt: new Date().toISOString(),
      comment: trimmedComment,
    };

    let batchFinalized = false;

    await this.prisma.$transaction(async (tx) => {
      await lockAndAssertBatchInReview(tx, item.batchId);

      // 1. Cập nhật câu hỏi có kiểm tra điều kiện nguyên tử chống ghi đè đồng thời
      const updateResult = await tx.item.updateMany({
        where: {
          id: itemId,
          reviewerId: teacherId,
          status: ItemStatus.DRAFT,
          batch: {
            status: ItemBatchStatus.IN_REVIEW,
          },
        },
        data: {
          status: nextStatus,
          firstReview: updatedFirstReview,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message:
            'Câu hỏi đã được xử lý hoặc bạn không còn được phân công duyệt câu hỏi này.',
        });
      }

      // 2. Ghi nhận nhật ký kiểm duyệt
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
