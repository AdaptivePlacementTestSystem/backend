import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { ReviewTasksResponseDto, ReviewBatchSummaryDto } from '../../dto/teacher-review.dto';
import { ItemStatus } from '@apt/shared-types';

@Injectable()
export class GetTeacherReviewTasksUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(teacherId: string): Promise<ReviewTasksResponseDto> {
    // 1. Lấy tất cả các câu được phân công cho GV A
    const items = await this.prisma.item.findMany({
      where: {
        reviewerId: teacherId,
      },
      include: {
        batch: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // 2. Nhóm theo Batch
    const batchMap = new Map<string, {
      batchId: string;
      batchName: string;
      items: typeof items;
    }>();

    for (const item of items) {
      if (!batchMap.has(item.batchId)) {
        batchMap.set(item.batchId, {
          batchId: item.batchId,
          batchName: item.batch?.name || `Lô ${item.batchId.slice(0, 8)}`,
          items: [],
        });
      }
      batchMap.get(item.batchId)!.items.push(item);
    }

    const now = new Date();
    const batches: ReviewBatchSummaryDto[] = [];
    let totalPendingReviews = 0;

    for (const [batchId, data] of batchMap.entries()) {
      const totalAssigned = data.items.length;
      let decidedCount = 0;
      let earliestDueAt: Date | null = null;

      for (const item of data.items) {
        if (item.status !== ItemStatus.DRAFT) {
          decidedCount++;
        }
        const firstReview = item.firstReview as Record<string, any> | null;
        if (firstReview?.dueAt) {
          const itemDue = new Date(firstReview.dueAt);
          if (!earliestDueAt || itemDue < earliestDueAt) {
            earliestDueAt = itemDue;
          }
        }
      }

      const pendingCount = totalAssigned - decidedCount;
      totalPendingReviews += pendingCount;

      batches.push({
        batchId,
        batchName: data.batchName,
        totalAssigned,
        decidedCount,
        pendingCount,
        dueAt: earliestDueAt ? earliestDueAt.toISOString() : null,
        isOverdue: earliestDueAt ? now > earliestDueAt : false,
      });
    }

    // 3. Đếm số câu cần confirm của GV B để hiển thị huy hiệu tab
    const pendingConfirms = await this.prisma.item.count({
      where: {
        confirmerId: teacherId,
        status: ItemStatus.FIRST_APPROVED,
      },
    });

    return {
      batches,
      stats: {
        pendingReviews: totalPendingReviews,
        pendingConfirms,
      },
    };
  }
}
