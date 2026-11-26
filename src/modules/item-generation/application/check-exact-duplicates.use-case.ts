import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
/** Lưu kết quả trùng chính xác T1; các tầng khác vẫn phải chạy trước khi giao. */
@Injectable()
export class CheckExactDuplicatesUseCase {
  constructor(private readonly prisma: PrismaService) {}
  async execute(batchId: string, checkpoint: 'C1' | 'C2' = 'C1') {
    return this.prisma.$transaction(async (tx) => {
      const items = await tx.item.findMany({
        where: { batchId, status: 'DRAFT' },
        select: { id: true, contentHash: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const hashes = items.flatMap((i) =>
        i.contentHash ? [i.contentHash] : [],
      );
      const others = hashes.length
        ? await tx.item.findMany({
            where: {
              batchId: { not: batchId },
              contentHash: { in: hashes },
              status: { notIn: ['AI_REJECTED', 'REJECTED'] },
            },
            select: { id: true, contentHash: true },
            orderBy: { createdAt: 'asc' },
          })
        : [];
      const seen = new Map<string, string>();
      for (const item of others)
        if (item.contentHash && !seen.has(item.contentHash))
          seen.set(item.contentHash, item.id);
      const rejected: Array<{
        itemId: string;
        contentHash: string;
        suspectedDuplicateId: string;
      }> = [];
      for (const item of items) {
        if (!item.contentHash) continue;
        const duplicate = seen.get(item.contentHash);
        if (duplicate)
          rejected.push({
            itemId: item.id,
            contentHash: item.contentHash,
            suspectedDuplicateId: duplicate,
          });
        else seen.set(item.contentHash, item.id);
      }
      if (rejected.length) {
        await tx.item.updateMany({
          where: { id: { in: rejected.map((x) => x.itemId) }, status: 'DRAFT' },
          data: { status: 'AI_REJECTED' },
        });
        await tx.itemCheckResult.createMany({
          data: rejected.map((x) => ({
            ...x,
            checkpoint,
            level: 'HARD',
            reasonCodes: ['DUPLICATE_EXACT'],
          })),
        });
      }
      return { checked: items.length, rejected: rejected.length };
    });
  }
}
