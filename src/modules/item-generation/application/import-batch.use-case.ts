import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { readT2Thresholds } from '../domain/duplicate-config';

/**
 * Import vào ngân hàng: SECOND_APPROVED -> FINAL_APPROVED (approved_by, approved_at, calibrated=false).
 * Chặn khi còn câu có cờ mềm C3 chưa được Admin quyết định. Lô -> DONE; không câu nào được import thì -> FAILED.
 */
@Injectable()
export class ImportBatchUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(batchId: string, actorId: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const batch = await tx.itemBatch.findUnique({
            where: { id: batchId },
            select: { status: true, updatedAt: true },
          });
          if (!batch) throw new NotFoundException('Không tìm thấy lô');
          if (!['FINAL_CHECKED', 'PARTIALLY_IMPORTED'].includes(batch.status))
            throw new ConflictException('Chỉ import lô đã kiểm lần cuối');
          const changedBank = await tx.item.findFirst({
            where: {
              status: 'FINAL_APPROVED',
              approvedAt: { not: null },
              batchId: { not: batchId },
            },
            select: { approvedAt: true },
            orderBy: { approvedAt: 'desc' },
          });
          const items = await tx.item.findMany({
            where: { batchId, status: 'SECOND_APPROVED' },
            select: { id: true, content: true, contentHash: true },
          });
          const ids: string[] = [];
          for (const item of items) {
            const marker = await tx.itemCheckResult.findFirst({
              where: {
                itemId: item.id,
                checkpoint: 'C3',
                contentHash: item.contentHash ?? '',
                reasonCodes: { has: 'INDEPENDENT_ANSWER_CHECKED' },
              },
              orderBy: { checkedAt: 'desc' },
              select: { checkedAt: true },
            });
            if (!marker) continue;
            if (
              changedBank?.approvedAt &&
              marker.checkedAt < changedBank.approvedAt
            )
              throw new ConflictException(
                'Ngân hàng đã thay đổi sau C3; hãy kiểm tra lại trước khi import',
              );
            const flag = await tx.itemCheckResult.findFirst({
              where: {
                itemId: item.id,
                checkpoint: 'C3',
                level: 'SOFT',
                checkedAt: { gte: marker.checkedAt },
              },
              orderBy: { checkedAt: 'desc' },
              select: { checkedAt: true },
            });
            if (flag) {
              const accepted = await tx.itemReviewEvent.findFirst({
                where: {
                  itemId: item.id,
                  action: 'ACCEPT_FLAG',
                  createdAt: { gte: flag.checkedAt },
                },
                select: { id: true },
              });
              if (!accepted) continue;
            }
            ids.push(item.id);
          }
          if (!ids.length) {
            const remaining = await tx.item.count({
              where: {
                batchId,
                status: { in: ['DRAFT', 'FIRST_APPROVED', 'SECOND_APPROVED'] },
              },
            });
            const imported = await tx.item.count({
              where: { batchId, status: 'FINAL_APPROVED' },
            });
            if (
              batch.status === 'PARTIALLY_IMPORTED' &&
              !remaining &&
              imported
            ) {
              await tx.itemBatch.update({
                where: { id: batchId },
                data: { status: 'DONE' },
              });
              return { status: 'DONE', imported: 0 };
            }
            throw new ConflictException(
              'Không có câu đủ điều kiện import; kiểm tra C3 và cờ mềm',
            );
          }
          for (const item of items.filter((entry) => ids.includes(entry.id))) {
            const [similar] = await tx.$queryRaw<
              Array<{ id: string; score: number }>
            >`SELECT id::text AS id, similarity(content, ${item.content})::float8 AS score FROM items WHERE id <> ${item.id}::uuid AND status NOT IN ('REJECTED', 'AI_REJECTED') ORDER BY score DESC LIMIT 1`;
            const score = similar ? Number(similar.score) : 0;
            if (score >= readT2Thresholds().hard)
              throw new ConflictException(
                'Ngân hàng đã thay đổi: phát hiện câu trùng, cần kiểm tra lại',
              );
            if (similar && score >= readT2Thresholds().soft) {
              const prior = await tx.itemCheckResult.findFirst({
                where: {
                  itemId: item.id,
                  checkpoint: 'C3',
                  contentHash: item.contentHash ?? '',
                  level: 'SOFT',
                  suspectedDuplicateId: similar.id,
                },
                select: { id: true },
              });
              if (!prior)
                throw new ConflictException(
                  'Ngân hàng đã thay đổi: cần kiểm tra lại trước khi import',
                );
            }
          }
          const now = new Date();
          if (ids.length) {
            const changed = await tx.item.updateMany({
              where: { id: { in: ids }, status: 'SECOND_APPROVED' },
              data: {
                status: 'FINAL_APPROVED',
                approvedById: actorId,
                approvedAt: now,
                calibrated: false,
              },
            });
            if (changed.count !== ids.length)
              throw new ConflictException('Danh sách câu đã thay đổi');
            await tx.itemReviewEvent.createMany({
              data: ids.map((itemId) => ({
                batchId,
                itemId,
                actorId,
                action: 'IMPORT' as const,
              })),
            });
          }
          const remaining = await tx.item.count({
            where: {
              batchId,
              status: { in: ['DRAFT', 'FIRST_APPROVED', 'SECOND_APPROVED'] },
            },
          });
          const status = remaining ? 'PARTIALLY_IMPORTED' : 'DONE';
          await tx.itemBatch.update({
            where: { id: batchId },
            data: { status },
          });
          return { status, imported: ids.length };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      )
        throw new ConflictException(
          'Lô hoặc ngân hàng đã thay đổi; vui lòng tải lại',
        );
      throw error;
    }
  }
}
