import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { assertJobLease, type JobLease } from '../infrastructure/job-lease';
import { readT2Thresholds } from '../domain/duplicate-config';
import {
  classifySimilarity,
  SimilarityThresholds,
  trigramSimilarity,
} from '../domain/text-similarity';

/** T2: trùng gần theo trigram. HARD (>= hard) tự loại, SOFT (>= soft) chỉ gắn cờ cho người xem. */
@Injectable()
export class CheckNearDuplicatesUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    batchId: string,
    checkpoint: 'C1' | 'C2' = 'C1',
    thresholds: SimilarityThresholds = readT2Thresholds(),
    lease?: JobLease,
  ) {
    if (lease && lease.batchId !== batchId)
      throw new Error('JOB_BATCH_MISMATCH');
    const items = await this.prisma.item.findMany({
      where: { batchId, status: 'DRAFT' },
      select: { id: true, content: true, contentHash: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const hits: Array<{
      itemId: string;
      contentHash: string;
      level: 'HARD' | 'SOFT';
      suspectedDuplicateId: string;
    }> = [];
    const kept: typeof items = [];
    for (const item of items) {
      if (!item.contentHash) {
        kept.push(item);
        continue;
      }
      let best: { id: string; score: number } | null = null;
      // So với các câu của lô khác (pg_trgm, dùng index GIN).
      const rows = await this.prisma.$queryRaw<
        Array<{ id: string; score: number }>
      >`SELECT id::text AS id, similarity(content, ${item.content})::float8 AS score
        FROM items
        WHERE batch_id <> ${batchId}::uuid
          AND status NOT IN ('AI_REJECTED', 'REJECTED')
          AND content % ${item.content}
        ORDER BY score DESC
        LIMIT 1`;
      if (rows[0]) best = { id: rows[0].id, score: Number(rows[0].score) };
      // So với các câu đã giữ trong cùng lô.
      for (const other of kept) {
        const score = trigramSimilarity(item.content, other.content);
        if (!best || score > best.score) best = { id: other.id, score };
      }
      const level = best ? classifySimilarity(best.score, thresholds) : 'NONE';
      if (best && level !== 'NONE') {
        hits.push({
          itemId: item.id,
          contentHash: item.contentHash,
          level,
          suspectedDuplicateId: best.id,
        });
        if (level === 'HARD') continue;
      }
      kept.push(item);
    }
    const hard = hits.filter((h) => h.level === 'HARD');
    await this.prisma.$transaction(async (tx) => {
      await assertJobLease(tx, lease);
      if (hard.length)
        await tx.item.updateMany({
          where: { id: { in: hard.map((h) => h.itemId) }, status: 'DRAFT' },
          data: { status: 'AI_REJECTED' },
        });
      if (hits.length)
        await tx.itemCheckResult.createMany({
          data: hits.map((h) => ({
            itemId: h.itemId,
            contentHash: h.contentHash,
            suspectedDuplicateId: h.suspectedDuplicateId,
            checkpoint,
            level: h.level,
            reasonCodes: [
              h.level === 'HARD' ? 'DUPLICATE_NEAR' : 'DUPLICATE_NEAR_SUSPECT',
            ],
          })),
        });
    });
    return {
      checked: items.length,
      rejected: hard.length,
      flagged: hits.length - hard.length,
    };
  }
}
