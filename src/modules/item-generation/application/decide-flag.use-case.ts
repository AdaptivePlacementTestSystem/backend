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
  ) {
    if (decision !== 'IMPORT' && decision !== 'REJECT')
      throw new BadRequestException('Quyết định phải là IMPORT hoặc REJECT');
    return this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.itemBatch.findUnique({
          where: { id: batchId },
          select: { status: true },
        });
        if (!batch) throw new NotFoundException('Không tìm thấy lô');
        if (batch.status !== 'FINAL_CHECKED')
          throw new ConflictException('Chỉ quyết định cờ khi lô đã kiểm lần cuối');
        const item = await tx.item.findFirst({
          where: { id: itemId, batchId },
          select: { status: true },
        });
        if (!item) throw new NotFoundException('Không tìm thấy câu trong lô');
        if (item.status !== 'SECOND_APPROVED')
          throw new ConflictException('Câu không ở trạng thái chờ quyết định');
        const flag = await tx.itemCheckResult.findFirst({
          where: { itemId, checkpoint: 'C3', level: 'SOFT' },
          select: { id: true },
        });
        if (!flag) throw new ConflictException('Câu không có cờ mềm cần quyết định');
        const decided = await tx.itemReviewEvent.findFirst({
          where: { itemId, action: 'ACCEPT_FLAG' },
          select: { id: true },
        });
        if (decided) throw new ConflictException('Câu đã được quyết định');
        if (decision === 'REJECT')
          await tx.item.update({ where: { id: itemId }, data: { status: 'REJECTED' } });
        await tx.itemReviewEvent.create({
          data: {
            batchId,
            itemId,
            actorId,
            action: decision === 'IMPORT' ? 'ACCEPT_FLAG' : 'REJECT',
          },
        });
        return { itemId, decision };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
