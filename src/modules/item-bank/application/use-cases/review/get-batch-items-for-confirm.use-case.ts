import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { ReviewItemDetailDto, OptionMap } from '../../dto/teacher-review.dto';
import { ErrorCode, ItemStatus, ReviewAction } from '@apt/shared-types';

@Injectable()
export class GetBatchItemsForConfirmUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    teacherId: string,
    batchId: string,
  ): Promise<{
    batchId: string;
    batchName: string;
    totalCount: number;
    decidedCount: number;
    items: ReviewItemDetailDto[];
  }> {
    const batch = await this.prisma.itemBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundException(`Không tìm thấy lô câu hỏi: ${batchId}`);
    }

    // WP-2.1: Nguồn sự thật GV vai B nằm ở ItemBatch.confirmerId
    if (batch.confirmerId !== teacherId) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_ASSIGNED,
        message:
          'Bạn không được phân công xác nhận câu hỏi trong lô này (NOT_ASSIGNED)',
      });
    }

    const items = await this.prisma.item.findMany({
      where: {
        batchId,
        OR: [
          { status: ItemStatus.FIRST_APPROVED },
          { status: ItemStatus.SECOND_APPROVED },
          {
            status: ItemStatus.REJECTED,
            secondReview: { path: ['action'], equals: ReviewAction.REMOVE },
          },
        ],
      },
      include: {
        explanation: true,
        reviewer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        checkResults: {
          select: {
            level: true,
            reasonCodes: true,
            suspectedDuplicateId: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (items.length === 0) {
      throw new NotFoundException(
        'Lô câu hỏi này chưa có câu hỏi nào cần xác nhận',
      );
    }

    let decidedCount = 0;
    const itemDtos: ReviewItemDetailDto[] = items.map((item) => {
      if (item.status !== ItemStatus.FIRST_APPROVED) {
        decidedCount++;
      }

      const firstReview = item.firstReview as Record<string, any> | null;
      const secondReview = item.secondReview as Record<string, any> | null;
      const originalSnapshot = firstReview?.originalSnapshot || null;

      return {
        id: item.id,
        content: item.content,
        options: item.options as unknown as OptionMap,
        correctAnswer: item.correctAnswer,
        skill: item.skill,
        cefrTarget: item.cefrTarget,
        topicTag: item.topicTag,
        irtB: item.irtB,
        status: item.status,
        explanation: item.explanation?.content || '',
        reviewerName:
          item.reviewer?.fullName || item.reviewer?.email || 'Giảng viên A',
        firstReview: firstReview
          ? {
              dueAt: firstReview.dueAt,
              action: firstReview.action || null,
              reviewedAt: firstReview.reviewedAt || null,
              comment: firstReview.comment || null,
              originalSnapshot,
            }
          : null,
        secondReview: secondReview
          ? {
              dueAt: secondReview.dueAt,
              action: secondReview.action || null,
              confirmedAt: secondReview.confirmedAt || null,
              comment: secondReview.comment || null,
            }
          : null,
        hasEdited: Boolean(originalSnapshot),
        flags: item.checkResults.map((cr) => ({
          level: cr.level,
          reasonCodes: cr.reasonCodes,
          suspectedDuplicateId: cr.suspectedDuplicateId,
        })),
      };
    });

    return {
      batchId: batch.id,
      batchName: batch.name || `Lô ${batch.id.slice(0, 8)}`,
      totalCount: items.length,
      decidedCount,
      items: itemDtos,
    };
  }
}
