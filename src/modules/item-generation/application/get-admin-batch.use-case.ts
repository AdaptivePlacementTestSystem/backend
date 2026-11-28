import { Injectable, NotFoundException } from '@nestjs/common';
import { ItemBatchSource, ItemBatchStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

/** Chi tiết chỉ đọc để Admin theo dõi lô và trạng thái từng câu. */
@Injectable()
export class GetAdminBatchUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    page: number,
    limit: number,
    filters: { status?: ItemBatchStatus; source?: ItemBatchSource } = {},
  ) {
    const where: Prisma.ItemBatchWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.source ? { source: filters.source } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.itemBatch.findMany({
        where,
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
      this.prisma.itemBatch.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async rejectedStats(
    dimension: 'batch' | 'reviewer' | 'reason',
    page: number,
    limit: number,
  ) {
    const offset = (page - 1) * limit;
    type Row = { key: string; label: string; count: number };
    let rows: Row[];
    if (dimension === 'batch') {
      rows = await this.prisma.$queryRaw<Row[]>`
        SELECT b.id::text AS key, COALESCE(NULLIF(b.name, ''), b.id::text) AS label, COUNT(*)::int AS count
        FROM items i JOIN item_batches b ON b.id = i.batch_id WHERE i.status::text = 'AI_REJECTED'
        GROUP BY b.id, b.name ORDER BY count DESC, b.id LIMIT ${limit + 1} OFFSET ${offset}`;
    } else if (dimension === 'reviewer') {
      rows = await this.prisma.$queryRaw<Row[]>`
        SELECT COALESCE(u.id::text, 'unassigned') AS key, COALESCE(u.full_name, 'Chưa phân công') AS label, COUNT(*)::int AS count
        FROM items i LEFT JOIN users u ON u.id = i.reviewer_id WHERE i.status::text = 'AI_REJECTED'
        GROUP BY u.id, u.full_name ORDER BY count DESC, key LIMIT ${limit + 1} OFFSET ${offset}`;
    } else {
      rows = await this.prisma.$queryRaw<Row[]>`
        SELECT reason AS key, reason AS label, COUNT(DISTINCT i.id)::int AS count
        FROM items i JOIN item_check_results c ON c.item_id = i.id CROSS JOIN LATERAL unnest(c.reason_codes) AS reason
        WHERE i.status::text = 'AI_REJECTED' AND c.level::text = 'HARD'
        GROUP BY reason ORDER BY count DESC, reason LIMIT ${limit + 1} OFFSET ${offset}`;
    }
    return {
      data: rows.slice(0, limit),
      page,
      limit,
      hasMore: rows.length > limit,
    };
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
        aiCallCount: true,
        aiCallLimit: true,
        createdAt: true,
        confirmer: { select: { id: true, fullName: true } },
        jobs: {
          select: { kind: true, status: true, attempts: true, lastError: true },
        },
      },
    });
    if (!batch) throw new NotFoundException('Không tìm thấy lô câu hỏi');

    const [items, total, grouped, cancellations] =
      await this.prisma.$transaction([
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
                checkedAt: true,
                suspectedDuplicateId: true,
              },
              orderBy: { checkedAt: 'desc' },
            },
            status: true,
            skill: true,
            cefrTarget: true,
            topicTag: true,
            irtB: true,
            generatedFromRefIds: true,
            firstReview: true,
            secondReview: true,
            reviewEvents: {
              where: { action: 'ACCEPT_FLAG' },
              select: { createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            reviewer: { select: { id: true, fullName: true } },
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
        this.prisma.itemReviewEvent.findMany({
          where: { batchId, action: 'CANCEL_PENDING' },
          select: { details: true },
        }),
      ]);
    const cancelledIds = new Set<string>();
    for (const event of cancellations) {
      if (
        event.details &&
        typeof event.details === 'object' &&
        !Array.isArray(event.details) &&
        Array.isArray(event.details.itemIds)
      )
        for (const id of event.details.itemIds)
          if (typeof id === 'string') cancelledIds.add(id);
    }
    return {
      batch,
      items: items.map((item) => ({
        ...item,
        confirmer: batch.confirmer,
        administrativelyCancelled: cancelledIds.has(item.id),
      })),
      administrativelyCancelledCount: cancelledIds.size,
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
