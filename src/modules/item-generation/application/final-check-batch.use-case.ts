import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { validateCandidate } from '../domain/candidate-validation';

/**
 * C3: kiểm lần cuối các câu SECOND_APPROVED của lô READY_TO_FINALIZE.
 * Lỗi cứng (hình thức) -> AI_REJECTED. Câu từng bị gắn cờ mềm ở C1/C2 (nghi trùng) -> ghi lại cờ mềm C3 để Admin quyết định.
 * Xong thì lô chuyển FINAL_CHECKED.
 */
@Injectable()
export class FinalCheckBatchUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(batchId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.itemBatch.findUnique({
          where: { id: batchId },
          select: { status: true },
        });
        if (!batch) throw new NotFoundException('Không tìm thấy lô');
        if (batch.status !== 'READY_TO_FINALIZE')
          throw new ConflictException('Chỉ kiểm lần cuối lô đã sẵn sàng chốt');
        const items = await tx.item.findMany({
          where: { batchId, status: 'SECOND_APPROVED' },
          select: {
            id: true,
            content: true,
            options: true,
            correctAnswer: true,
            skill: true,
            cefrTarget: true,
            topicTag: true,
            contentHash: true,
            explanation: { select: { content: true } },
          },
        });
        const hard: Array<{ id: string; hash: string; codes: string[] }> = [];
        const passed: typeof items = [];
        for (const item of items) {
          const codes = validateCandidate({
            content: item.content,
            options: item.options,
            correctAnswer: item.correctAnswer,
            skill: item.skill,
            cefrTarget: item.cefrTarget,
            topicTag: item.topicTag,
            explanation: item.explanation?.content,
          });
          if (codes.length)
            hard.push({ id: item.id, hash: item.contentHash ?? '', codes });
          else passed.push(item);
        }
        if (hard.length) {
          await tx.item.updateMany({
            where: {
              id: { in: hard.map((h) => h.id) },
              status: 'SECOND_APPROVED',
            },
            data: { status: 'AI_REJECTED' },
          });
          await tx.itemCheckResult.createMany({
            data: hard.map((h) => ({
              itemId: h.id,
              contentHash: h.hash,
              checkpoint: 'C3' as const,
              level: 'HARD' as const,
              reasonCodes: h.codes,
            })),
          });
        }
        // Cờ mềm còn hiệu lực: kết quả SOFT mới nhất ở C1/C2 của các câu còn lại.
        const earlier = passed.length
          ? await tx.itemCheckResult.findMany({
              where: {
                itemId: { in: passed.map((i) => i.id) },
                checkpoint: { in: ['C1', 'C2'] },
                level: 'SOFT',
              },
              orderBy: { checkedAt: 'desc' },
            })
          : [];
        const latest = new Map<string, (typeof earlier)[number]>();
        const currentHashes = new Map(
          passed.map((item) => [item.id, item.contentHash]),
        );
        for (const r of earlier)
          if (
            r.contentHash === currentHashes.get(r.itemId) &&
            !latest.has(r.itemId)
          )
            latest.set(r.itemId, r);
        if (latest.size)
          await tx.itemCheckResult.createMany({
            data: [...latest.values()].map((r) => ({
              itemId: r.itemId,
              contentHash: r.contentHash,
              checkpoint: 'C3' as const,
              level: 'SOFT' as const,
              reasonCodes: r.reasonCodes,
              suspectedDuplicateId: r.suspectedDuplicateId,
            })),
          });
        await tx.itemBatch.update({
          where: { id: batchId },
          data: { status: 'FINAL_CHECKED' },
        });
        return {
          status: 'FINAL_CHECKED' as const,
          checked: items.length,
          hardRejected: hard.length,
          softFlagged: latest.size,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
