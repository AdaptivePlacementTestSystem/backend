import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { ItemStatus, ReviewAction } from '@apt/shared-types';

@Injectable()
export class ReviewItemUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    teacherId: string,
    itemId: string,
    action: 'APPROVE' | 'REJECT',
    comment?: string,
  ): Promise<{ success: boolean; itemId: string; status: ItemStatus }> {
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

    const nextStatus = action === 'APPROVE' ? ItemStatus.FIRST_APPROVED : ItemStatus.REJECTED;
    const reviewAction = action === 'APPROVE' ? ReviewAction.APPROVE : ReviewAction.REJECT;

    const firstReview = (item.firstReview as Record<string, any>) || {};
    const updatedFirstReview = {
      ...firstReview,
      action: reviewAction,
      reviewedAt: new Date().toISOString(),
      comment: comment?.trim() || null,
    };

    await this.prisma.$transaction(async (tx) => {
      // 1. Cập nhật câu hỏi
      await tx.item.update({
        where: { id: itemId },
        data: {
          status: nextStatus,
          firstReview: updatedFirstReview,
        },
      });

      // 2. Ghi nhận nhật ký kiểm duyệt
      await tx.itemReviewEvent.create({
        data: {
          batchId: item.batchId,
          itemId: item.id,
          actorId: teacherId,
          action: reviewAction,
        },
      });
    });

    return {
      success: true,
      itemId: item.id,
      status: nextStatus,
    };
  }
}
