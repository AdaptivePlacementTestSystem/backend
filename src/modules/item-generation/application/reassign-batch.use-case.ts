import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ReviewNotificationsService } from './review-notifications.service';

export type ReassignRequest = {
  fromAssigneeId: string;
  toAssigneeId: string;
  reason: string;
};

@Injectable()
export class ReassignBatchUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: ReviewNotificationsService,
  ) {}

  async execute(batchId: string, actorId: string, input: ReassignRequest) {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      !input ||
      !uuid.test(input.fromAssigneeId ?? '') ||
      !uuid.test(input.toAssigneeId ?? '') ||
      input.fromAssigneeId === input.toAssigneeId
    )
      throw new BadRequestException('Cần hai giảng viên khác nhau hợp lệ');
    if (
      typeof input.reason !== 'string' ||
      !input.reason.trim() ||
      input.reason.length > 500
    )
      throw new BadRequestException('Cần lý do giao lại không quá 500 ký tự');
    const result = await this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.itemBatch.findUnique({
          where: { id: batchId },
          select: { status: true, confirmerId: true },
        });
        if (!batch) throw new NotFoundException('Không tìm thấy lô');
        if (batch.status !== 'IN_REVIEW')
          throw new ConflictException('Chỉ giao lại lô đang duyệt');
        if (!batch.confirmerId || batch.confirmerId === input.toAssigneeId)
          throw new BadRequestException('GV A phải khác GV B của lô');
        const teacher = await tx.user.findFirst({
          where: {
            id: input.toAssigneeId,
            role: UserRole.TEACHER,
            isActive: true,
          },
          select: { id: true },
        });
        if (!teacher)
          throw new BadRequestException(
            'Giảng viên mới không tồn tại hoặc không hoạt động',
          );
        const items = await tx.item.findMany({
          where: { batchId, status: 'DRAFT', reviewerId: input.fromAssigneeId },
          select: { id: true },
        });
        if (!items.length)
          throw new ConflictException('Không có câu DRAFT để giao lại');
        const ids = items.map((item) => item.id);
        const changed = await tx.item.updateMany({
          where: {
            id: { in: ids },
            batchId,
            status: 'DRAFT',
            reviewerId: input.fromAssigneeId,
            batch: {
              is: { status: 'IN_REVIEW', confirmerId: batch.confirmerId },
            },
          },
          data: {
            reviewerId: input.toAssigneeId,
            firstAssignmentNoticeSent: false,
            firstReminderSent: false,
          },
        });
        if (changed.count !== ids.length)
          throw new ConflictException('Danh sách câu đã thay đổi');
        await tx.itemReviewEvent.createMany({
          data: ids.map((itemId) => ({
            batchId,
            itemId,
            actorId,
            action: 'REASSIGN' as const,
            details: {
              fromAssigneeId: input.fromAssigneeId,
              toAssigneeId: input.toAssigneeId,
              reason: input.reason.trim(),
            },
          })),
        });
        return { reassigned: ids.length };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (this.notifications)
      void this.notifications.assigned(batchId).catch(() => undefined);
    return result;
  }
}
