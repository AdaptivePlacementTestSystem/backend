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
import { assignmentRevision } from '../domain/assignment-preview';
import { isUUID } from 'class-validator';

type Assignment = { itemId: string; reviewerId: string };
export type AssignRequest = {
  confirmerId: string;
  firstDueAt: string;
  secondDueAt: string;
  assignments: Assignment[];
  batchRevision: string;
};

@Injectable()
export class AssignBatchUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: ReviewNotificationsService,
  ) {}
  async execute(batchId: string, actorId: string, body: AssignRequest) {
    if (
      !body ||
      !isUUID(body.confirmerId) ||
      typeof body.batchRevision !== 'string' ||
      !/^[a-f0-9]{64}$/.test(body.batchRevision) ||
      !Array.isArray(body.assignments) ||
      !body.assignments.length ||
      body.assignments.some(
        (entry) => !entry || !isUUID(entry.itemId) || !isUUID(entry.reviewerId),
      )
    )
      throw new BadRequestException(
        'Chọn một giảng viên B hợp lệ, khác với nhóm A',
      );
    const first = new Date(body.firstDueAt),
      second = new Date(body.secondDueAt);
    if (
      !Number.isFinite(first.getTime()) ||
      !Number.isFinite(second.getTime()) ||
      first <= new Date() ||
      second <= first
    )
      throw new BadRequestException(
        'Hạn vòng A phải ở tương lai và hạn vòng B phải sau vòng A',
      );
    const entries = body.assignments;
    const reviewerIds = [...new Set(entries.map((entry) => entry.reviewerId))];
    if (reviewerIds.includes(body.confirmerId))
      throw new ConflictException({
        code: 'CONFIRMER_IN_REVIEW_GROUP',
        message: 'Giảng viên B phải khác nhóm A',
      });
    if (
      !entries.length ||
      entries.some(
        (a) => !a || typeof a.itemId !== 'string' || !isUUID(a.reviewerId),
      ) ||
      new Set(entries.map((a) => a.itemId)).size !== entries.length
    )
      throw new BadRequestException('Phân công câu hỏi không hợp lệ');
    const result = await this.prisma
      .$transaction(
        async (tx) => {
          const batch = await tx.itemBatch.findUnique({
            where: { id: batchId },
            select: { status: true },
          });
          if (!batch) throw new NotFoundException('Không tìm thấy lô');
          if (batch.status !== 'READY_TO_ASSIGN')
            throw new ConflictException('Lô không ở trạng thái chờ giao việc');
          const teachers = await tx.user.count({
            where: {
              id: { in: [...reviewerIds, body.confirmerId] },
              role: UserRole.TEACHER,
              isActive: true,
            },
          });
          if (teachers !== reviewerIds.length + 1)
            throw new BadRequestException(
              'Giảng viên không tồn tại hoặc không hoạt động',
            );
          const items = await tx.item.findMany({
            where: { batchId, status: 'DRAFT' },
            select: {
              id: true,
              skill: true,
              cefrTarget: true,
              createdAt: true,
            },
          });
          if (assignmentRevision(batch.status, items) !== body.batchRevision)
            throw new ConflictException(
              'Dữ liệu lô đã thay đổi; vui lòng xem trước lại',
            );
          const ids = new Set(items.map((item) => item.id));
          if (
            items.length !== entries.length ||
            entries.some((a) => !ids.has(a.itemId))
          )
            throw new ConflictException(
              'Danh sách câu đã thay đổi; vui lòng tải lại',
            );
          const changed = await tx.itemBatch.updateMany({
            where: { id: batchId, status: 'READY_TO_ASSIGN' },
            data: { status: 'IN_REVIEW', confirmerId: body.confirmerId },
          });
          if (changed.count !== 1)
            throw new ConflictException('Lô đã được giao');
          for (const a of entries) {
            await tx.item.update({
              where: { id: a.itemId },
              data: {
                reviewerId: a.reviewerId,
                confirmerId: null,
                firstReview: { dueAt: first.toISOString() },
                secondReview: { dueAt: second.toISOString() },
              },
            });
            await tx.itemReviewEvent.create({
              data: { batchId, itemId: a.itemId, actorId, action: 'ASSIGN' },
            });
          }
          return { assigned: entries.length };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        )
          throw new ConflictException(
            'Phân công đồng thời đã thay đổi lô; vui lòng xem trước lại',
          );
        throw error;
      });
    if (this.notifications)
      void this.notifications.assigned(batchId).catch(() => undefined);
    return result;
  }
}
