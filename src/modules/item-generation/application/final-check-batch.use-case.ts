import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { validateCandidate } from '../domain/candidate-validation';
import { CheckSemanticDuplicatesUseCase } from './check-semantic-duplicates.use-case';
import { CheckIndependentAnswerUseCase } from './check-independent-answer.use-case';
import { readT2Thresholds } from '../domain/duplicate-config';

/**
 * C3: kiểm lần cuối các câu SECOND_APPROVED của lô READY_TO_FINALIZE.
 * Lỗi cứng (hình thức) -> AI_REJECTED. Câu từng bị gắn cờ mềm ở C1/C2 (nghi trùng) -> ghi lại cờ mềm C3 để Admin quyết định.
 * Xong thì lô chuyển FINAL_CHECKED.
 */
@Injectable()
export class FinalCheckBatchUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly semantic: CheckSemanticDuplicatesUseCase,
    private readonly answer: CheckIndependentAnswerUseCase,
  ) {}

  async execute(batchId: string) {
    const current = await this.prisma.itemBatch.findUnique({
      where: { id: batchId },
      select: { status: true },
    });
    if (!current) throw new NotFoundException('Không tìm thấy lô');
    if (
      !['READY_TO_FINALIZE', 'FINAL_CHECKED', 'PARTIALLY_IMPORTED'].includes(
        current.status,
      )
    )
      throw new ConflictException('Chỉ kiểm lần cuối lô đã sẵn sàng chốt');
    if (
      current.status === 'FINAL_CHECKED' ||
      current.status === 'PARTIALLY_IMPORTED'
    ) {
      const reset = await this.prisma.itemBatch.updateMany({
        where: { id: batchId, status: current.status },
        data: { status: 'READY_TO_FINALIZE' },
      });
      if (reset.count !== 1)
        throw new ConflictException('Trạng thái lô đã thay đổi');
    }
    const bankBefore = await this.prisma.item.findFirst({
      where: { status: 'FINAL_APPROVED', approvedAt: { not: null } },
      orderBy: [{ approvedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, approvedAt: true },
    });
    try {
      const semantic = await this.semantic.execute(batchId, 'C3');
      if (semantic.skipped) throw new Error('T3_UNAVAILABLE');
      await this.answer.execute(batchId, 'C3');
    } catch (error) {
      if (error instanceof Error && error.message === 'AI_BUDGET_EXCEEDED')
        throw new ConflictException({
          code: 'BATCH_BUDGET_EXCEEDED',
          message: 'Lô đã hết 250 lượt gọi AI.',
        });
      throw new ServiceUnavailableException(
        'Chưa hoàn tất T3/G5; kiểm tra dịch vụ AI và thử lại',
      );
    }
    return this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.itemBatch.findUnique({
          where: { id: batchId },
          select: { status: true },
        });
        if (!batch) throw new NotFoundException('Không tìm thấy lô');
        if (batch.status !== 'READY_TO_FINALIZE')
          throw new ConflictException('Chỉ kiểm lần cuối lô đã sẵn sàng chốt');
        const bankAfter = await tx.item.findFirst({
          where: { status: 'FINAL_APPROVED', approvedAt: { not: null } },
          orderBy: [{ approvedAt: 'desc' }, { id: 'desc' }],
          select: { id: true, approvedAt: true },
        });
        if (
          bankBefore?.id !== bankAfter?.id ||
          bankBefore?.approvedAt?.getTime() !== bankAfter?.approvedAt?.getTime()
        )
          throw new ConflictException(
            'Ngân hàng thay đổi trong khi kiểm tra; vui lòng thử lại',
          );
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
          const [similar] = await tx.$queryRaw<
            Array<{ id: string; score: number }>
          >`SELECT id::text AS id, similarity(content, ${item.content})::float8 AS score FROM items WHERE id <> ${item.id}::uuid AND status NOT IN ('REJECTED', 'AI_REJECTED') ORDER BY score DESC LIMIT 1`;
          const score = similar ? Number(similar.score) : 0;
          if (score >= readT2Thresholds().hard) codes.push('DUPLICATE_NEAR');
          else if (
            similar &&
            score >= readT2Thresholds().soft &&
            item.contentHash
          )
            await tx.itemCheckResult.create({
              data: {
                itemId: item.id,
                checkpoint: 'C3',
                contentHash: item.contentHash,
                level: 'SOFT',
                reasonCodes: ['DUPLICATE_NEAR_SUSPECT'],
                suspectedDuplicateId: similar.id,
              },
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
            !r.reasonCodes.includes('INDEPENDENT_ANSWER_CHECKED') &&
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
              reasonCodes: r.reasonCodes.filter(
                (code) => code !== 'INDEPENDENT_ANSWER_CHECKED',
              ),
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
