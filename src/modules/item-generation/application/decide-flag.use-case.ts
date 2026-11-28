import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export type FlagDecision = 'IMPORT' | 'REJECT';

/** Admin quyết định lỗi mềm C3: IMPORT (ghi ACCEPT_FLAG, giữ SECOND_APPROVED) hoặc REJECT (REJECTED). */
@Injectable()
export class DecideFlagUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    batchId: string,
    itemId: string,
    actorId: string,
    decision: FlagDecision,
    comment?: string,
  ) {
    if (decision !== 'IMPORT' && decision !== 'REJECT')
      throw new BadRequestException('Quyết định phải là IMPORT hoặc REJECT');
    if (comment != null && typeof comment !== 'string')
      throw new BadRequestException('Comment phải là chuỗi');
    if (decision === 'REJECT' && !comment?.trim())
      throw new BadRequestException('Bắt buộc nhập lý do loại câu');
    return this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.itemBatch.findUnique({
          where: { id: batchId },
          select: { status: true },
        });
        if (!batch) throw new NotFoundException('Không tìm thấy lô');
        if (!['FINAL_CHECKED', 'PARTIALLY_IMPORTED'].includes(batch.status))
          throw new ConflictException(
            'Chỉ quyết định cờ khi lô đã kiểm lần cuối',
          );
        const item = await tx.item.findFirst({
          where: { id: itemId, batchId },
          select: { status: true },
        });
        if (!item) throw new NotFoundException('Không tìm thấy câu trong lô');
        if (item.status !== 'SECOND_APPROVED')
          throw new ConflictException('Câu không ở trạng thái chờ quyết định');
        const marker = await tx.itemCheckResult.findFirst({
          where: {
            itemId,
            checkpoint: 'C3',
            reasonCodes: { has: 'INDEPENDENT_ANSWER_CHECKED' },
          },
          orderBy: { checkedAt: 'desc' },
          select: { checkedAt: true },
        });
        if (!marker)
          throw new ConflictException('Chưa có kết quả kiểm tra đáp án hợp lệ');
        const flag = await tx.itemCheckResult.findFirst({
          where: {
            itemId,
            checkpoint: 'C3',
            level: 'SOFT',
            checkedAt: { gte: marker.checkedAt },
          },
          orderBy: { checkedAt: 'desc' },
          select: { id: true, checkedAt: true },
        });
        if (!flag)
          throw new ConflictException('Câu không có cờ mềm cần quyết định');
        const decided = await tx.itemReviewEvent.findFirst({
          where: {
            itemId,
            action: 'ACCEPT_FLAG',
            createdAt: { gte: flag.checkedAt },
          },
          select: { id: true },
        });
        if (decided) throw new ConflictException('Câu đã được quyết định');
        if (decision === 'REJECT')
          await tx.item.update({
            where: { id: itemId },
            data: { status: 'REJECTED' },
          });
        await tx.itemReviewEvent.create({
          data: {
            batchId,
            itemId,
            actorId,
            action: decision === 'IMPORT' ? 'ACCEPT_FLAG' : 'REJECT',
            ...(comment?.trim()
              ? { details: { comment: comment.trim() } }
              : {}),
          },
        });
        if (decision === 'REJECT') {
          const remaining = await tx.item.count({
            where: {
              batchId,
              status: { in: ['DRAFT', 'FIRST_APPROVED', 'SECOND_APPROVED'] },
            },
          });
          if (!remaining)
            await tx.itemBatch.updateMany({
              where: { id: batchId, status: batch.status },
              data: { status: 'DONE' },
            });
        }
        return { itemId, decision };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
