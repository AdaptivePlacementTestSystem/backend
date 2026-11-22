import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { ConfirmTasksResponseDto, ConfirmBatchSummaryDto } from '../../dto/teacher-review.dto';
import { ItemStatus } from '@apt/shared-types';

@Injectable()
export class GetTeacherConfirmTasksUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(teacherId: string): Promise<ConfirmTasksResponseDto> {
    // 1. Lấy tất cả các câu đã qua vòng 1 hoặc đã được B xử lý
    const items = await this.prisma.item.findMany({
      where: {
        confirmerId: teacherId,
        OR: [
          { status: ItemStatus.FIRST_APPROVED },
          { status: ItemStatus.SECOND_APPROVED },
          {
            status: ItemStatus.REJECTED,
            secondReview: { not: null as any },
          },
        ],
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
    const batches: ConfirmBatchSummaryDto[] = [];
    let totalPendingConfirms = 0;

    for (const [batchId, data] of batchMap.entries()) {
      let pendingCount = 0;
      let confirmedCount = 0;
      let removedCount = 0;
      let earliestDueAt: Date | null = null;

      for (const item of data.items) {
        if (item.status === ItemStatus.FIRST_APPROVED) {
          pendingCount++;
        } else if (item.status === ItemStatus.SECOND_APPROVED) {
          confirmedCount++;
        } else if (item.status === ItemStatus.REJECTED) {
          removedCount++;
        }

        const secondReview = item.secondReview as Record<string, any> | null;
        if (secondReview?.dueAt) {
          const itemDue = new Date(secondReview.dueAt);
          if (!earliestDueAt || itemDue < earliestDueAt) {
            earliestDueAt = itemDue;
          }
        }
      }

      totalPendingConfirms += pendingCount;
      const totalAssigned = data.items.length;
      const decidedCount = confirmedCount + removedCount;

      batches.push({
        batchId,
        batchName: data.batchName,
        totalAssigned,
        pendingCount,
        confirmedCount,
        removedCount,
        decidedCount,
        dueAt: earliestDueAt ? earliestDueAt.toISOString() : null,
        isOverdue: earliestDueAt ? now > earliestDueAt : false,
      });
    }

    // 3. Đếm số câu cần duyệt của GV A để hiển thị tab stats
    const pendingReviews = await this.prisma.item.count({
      where: {
        reviewerId: teacherId,
        status: ItemStatus.DRAFT,
      },
    });

    return {
      batches,
      stats: {
        pendingReviews,
        pendingConfirms: totalPendingConfirms,
      },
    };
  }
}
