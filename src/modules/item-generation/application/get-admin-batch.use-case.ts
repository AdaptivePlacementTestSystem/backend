import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

/** Chi tiết chỉ đọc để Admin theo dõi lô và trạng thái từng câu. */
@Injectable()
export class GetAdminBatchUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async list(page: number, limit: number) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.itemBatch.findMany({
        select: {
          id: true,
          name: true,
          source: true,
          status: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.itemBatch.count(),
    ]);
    return { data, total, page, limit };
  }

  async execute(batchId: string, page: number, limit: number) {
    const batch = await this.prisma.itemBatch.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        name: true,
        source: true,
        status: true,
        skill: true,
        cefrTarget: true,
        topicTag: true,
        requestedCount: true,
        createdAt: true,
      },
    });
    if (!batch) throw new NotFoundException('Không tìm thấy lô câu hỏi');

    const [items, total, grouped] = await this.prisma.$transaction([
      this.prisma.item.findMany({
        where: { batchId },
        select: {
          id: true,
          content: true,
          options: true,
          correctAnswer: true,
          explanation: { select: { content: true } },
          checkResults: {
            select: {
              checkpoint: true,
              level: true,
              reasonCodes: true,
              suspectedDuplicateId: true,
            },
            orderBy: { checkedAt: 'desc' },
          },
          status: true,
          skill: true,
          cefrTarget: true,
          topicTag: true,
          irtB: true,
          firstReview: true,
          secondReview: true,
          reviewer: { select: { id: true, fullName: true } },
          confirmer: { select: { id: true, fullName: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.item.count({ where: { batchId } }),
      this.prisma.item.groupBy({
        by: ['status'],
        where: { batchId },
        _count: { _all: true },
      }),
    ]);
    return {
      batch,
      items,
      total,
      page,
      limit,
      statusCounts: grouped.map((entry) => ({
        status: entry.status,
        count: entry._count._all,
      })),
    };
  }
}
