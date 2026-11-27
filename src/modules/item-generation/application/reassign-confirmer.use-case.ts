import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class ReassignConfirmerUseCase {
  constructor(private readonly prisma: PrismaService) {}
  async execute(
    batchId: string,
    actorId: string,
    body: { toConfirmerId?: unknown; reason?: unknown },
  ) {
    if (
      !body ||
      typeof body.toConfirmerId !== 'string' ||
      !isUUID(body.toConfirmerId) ||
      typeof body.reason !== 'string' ||
      !body.reason.trim() ||
      body.reason.length > 500
    )
      throw new BadRequestException('Cần giảng viên B và lý do hợp lệ');
    const toConfirmerId = body.toConfirmerId,
      reason = body.reason.trim();
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM item_batches WHERE id = ${batchId}::uuid FOR UPDATE`;
          const batch = await tx.itemBatch.findUnique({
            where: { id: batchId },
            select: { status: true, confirmerId: true },
          });
          if (!batch) throw new NotFoundException('Không tìm thấy lô');
          if (batch.status !== 'IN_REVIEW' || !batch.confirmerId)
            throw new ConflictException('Lô không ở trạng thái đang duyệt');
          if (batch.confirmerId === toConfirmerId)
            throw new BadRequestException(
              'Giảng viên B mới phải khác người hiện tại',
            );
          const teacher = await tx.user.findFirst({
            where: {
              id: toConfirmerId,
              role: UserRole.TEACHER,
              isActive: true,
            },
            select: { id: true },
          });
          if (!teacher)
            throw new BadRequestException(
              'Giảng viên B mới không hoạt động hoặc không tồn tại',
            );
          if (
            await tx.item.count({
              where: { batchId, reviewerId: toConfirmerId },
            })
          )
            throw new ConflictException({
              code: 'CONFIRMER_IN_REVIEW_GROUP',
              message: 'Giảng viên B phải khác mọi giảng viên A',
            });
          const pending = await tx.item.findMany({
            where: { batchId, status: { in: ['DRAFT', 'FIRST_APPROVED'] } },
            select: { id: true },
          });
          if (!pending.length)
            throw new ConflictException('Không còn câu chờ xử lý');
          await tx.itemBatch.update({
            where: { id: batchId },
            data: { confirmerId: toConfirmerId },
          });
          const updated = await tx.item.updateMany({
            where: {
              id: { in: pending.map((item) => item.id) },
              batchId,
              status: { in: ['DRAFT', 'FIRST_APPROVED'] },
            },
            data: {
              secondAssignmentNoticeSent: false,
              secondReminderSent: false,
            },
          });
          if (updated.count !== pending.length)
            throw new ConflictException('Lô đã thay đổi; vui lòng tải lại');
          await tx.itemReviewEvent.create({
            data: {
              batchId,
              itemId: null,
              actorId,
              action: 'REASSIGN_CONFIRMER',
              details: {
                fromConfirmerId: batch.confirmerId,
                toConfirmerId,
                reason,
                itemIds: pending.map((item) => item.id),
                updatedCount: pending.length,
              },
            },
          });
          await tx.reviewNoticeOutbox.create({
            data: { batchId, recipientId: toConfirmerId },
          });
          return { confirmerId: toConfirmerId, affected: pending.length };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      )
        throw new ConflictException('Lô đã thay đổi; vui lòng tải lại');
      throw error;
    }
  }
}
