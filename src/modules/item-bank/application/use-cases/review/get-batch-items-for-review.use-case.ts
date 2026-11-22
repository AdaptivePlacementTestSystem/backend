import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { ReviewItemDetailDto, OptionMap } from '../../dto/teacher-review.dto';

@Injectable()
export class GetBatchItemsForReviewUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(teacherId: string, batchId: string): Promise<{
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

    const items = await this.prisma.item.findMany({
      where: {
        batchId,
        reviewerId: teacherId,
      },
      include: {
        explanation: true,
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
      // Kiểm tra xem GV có được giao câu nào trong lô không
      const anyItemInBatch = await this.prisma.item.findFirst({
        where: { batchId },
      });
      if (anyItemInBatch) {
        throw new ForbiddenException('Bạn không được phân công duyệt câu hỏi trong lô này (NOT_ASSIGNED)');
      }
      throw new NotFoundException('Lô câu hỏi này chưa có câu hỏi nào');
    }

    let decidedCount = 0;
    const itemDtos: ReviewItemDetailDto[] = items.map((item) => {
      if (item.status !== 'DRAFT') {
        decidedCount++;
      }

      const firstReview = item.firstReview as Record<string, any> | null;
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
        firstReview: firstReview ? {
          dueAt: firstReview.dueAt,
          action: firstReview.action || null,
          reviewedAt: firstReview.reviewedAt || null,
          comment: firstReview.comment || null,
          originalSnapshot,
        } : null,
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
