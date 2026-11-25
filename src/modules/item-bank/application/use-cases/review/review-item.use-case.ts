import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { ItemStatus, ReviewAction, ItemBatchStatus, ErrorCode } from '@apt/shared-types';

@Injectable()
export class ReviewItemUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    teacherId: string,
    itemId: string,
    action: 'APPROVE' | 'REJECT',
    comment?: string,
  ): Promise<{ success: boolean; itemId: string; status: ItemStatus; batchFinalized: boolean }> {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundException(`Không tìm thấy câu hỏi: ${itemId}`);
    }

    if (item.reviewerId !== teacherId) {
      throw new ForbiddenException('Bạn không được phân công duyệt câu hỏi này (NOT_ASSIGNED)');
    }

    if (item.status !== ItemStatus.DRAFT) {
      throw new BadRequestException('Câu hỏi này đã có quyết định, không thể duyệt lại');
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
            message: 'Câu hỏi sau khi sửa bị trùng lặp với câu hỏi khác trong ngân hàng. Không thể duyệt.',
          });
        }
      }

      const opts = item.options as Record<string, string> | null;
      if (!item.content?.trim() || !opts?.A?.trim() || !opts?.B?.trim() || !opts?.C?.trim() || !opts?.D?.trim()) {
        throw new UnprocessableEntityException({
          code: ErrorCode.INVALID_AFTER_EDIT,
          message: 'Bản sửa không hợp lệ hoặc thiếu dữ liệu, không thể duyệt.',
        });
      }
    }

    const nextStatus = action === 'APPROVE' ? ItemStatus.FIRST_APPROVED : ItemStatus.REJECTED;
    const reviewAction = action === 'APPROVE' ? ReviewAction.APPROVE : ReviewAction.REJECT;

    const firstReview = (item.firstReview as Record<string, any>) || {};
    const updatedFirstReview = {
      ...firstReview,
      action: reviewAction,
      reviewedAt: new Date().toISOString(),
      comment: comment?.trim() || null,
    };

    let batchFinalized = false;

    await this.prisma.$transaction(async (tx) => {
      // 1. Cập nhật câu hỏi có kiểm tra điều kiện nguyên tử chống ghi đè đồng thời
      const updateResult = await tx.item.updateMany({
        where: {
          id: itemId,
          reviewerId: teacherId,
          status: ItemStatus.DRAFT,
        },
        data: {
          status: nextStatus,
          firstReview: updatedFirstReview,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'Câu hỏi đã được xử lý hoặc bạn không còn được phân công duyệt câu hỏi này.',
        });
      }

      // 2. Ghi nhận nhật ký kiểm duyệt
      await tx.itemReviewEvent.create({
        data: {
          batchId: item.batchId,
          itemId: item.id,
          actorId: teacherId,
          action: reviewAction,
        },
      });

      // 3. Kiểm tra xem toàn bộ câu trong lô đã hoàn tất chưa (xét cả khi A từ chối câu cuối)
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
