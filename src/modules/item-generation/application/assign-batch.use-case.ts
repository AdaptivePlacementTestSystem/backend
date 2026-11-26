import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

type Assignment = { itemId: string; reviewerId: string; confirmerId: string };
export type AssignRequest = {
  reviewerIds: string[];
  confirmerIds: string[];
  firstDueAt: string;
  secondDueAt: string;
  assignments: Assignment[];
};

@Injectable()
export class AssignBatchUseCase {
  constructor(private readonly prisma: PrismaService) {}
  async execute(batchId: string, actorId: string, body: AssignRequest) {
    const validIds = (v: unknown): v is string[] =>
      Array.isArray(v) &&
      v.length > 0 &&
      v.every(
        (x) =>
          typeof x === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            x,
          ),
      ) &&
      new Set(v).size === v.length;
    if (
      !body ||
      !validIds(body.reviewerIds) ||
      !validIds(body.confirmerIds) ||
      body.confirmerIds.length !== 1 ||
      body.reviewerIds.some((id) => body.confirmerIds.includes(id)) ||
      !Array.isArray(body.assignments)
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
    if (
      !entries.length ||
      entries.some(
        (a) =>
          !a ||
          typeof a.itemId !== 'string' ||
          !body.reviewerIds.includes(a.reviewerId) ||
          !body.confirmerIds.includes(a.confirmerId),
      ) ||
      new Set(entries.map((a) => a.itemId)).size !== entries.length
    )
      throw new BadRequestException('Phân công câu hỏi không hợp lệ');
    return this.prisma.$transaction(
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
            id: { in: [...body.reviewerIds, ...body.confirmerIds] },
            role: UserRole.TEACHER,
            isActive: true,
          },
        });
        if (teachers !== body.reviewerIds.length + body.confirmerIds.length)
          throw new BadRequestException(
            'Giảng viên không tồn tại hoặc không hoạt động',
          );
        const items = await tx.item.findMany({
          where: { batchId, status: 'DRAFT' },
          select: { id: true },
        });
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
          data: { status: 'IN_REVIEW' },
        });
        if (changed.count !== 1) throw new ConflictException('Lô đã được giao');
        for (const a of entries) {
          await tx.item.update({
            where: { id: a.itemId },
            data: {
              reviewerId: a.reviewerId,
              confirmerId: a.confirmerId,
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
    );
  }
}
