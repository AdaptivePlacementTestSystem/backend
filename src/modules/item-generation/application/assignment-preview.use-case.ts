import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  assignmentRevision,
  orderedAssignmentItems,
} from '../domain/assignment-preview';

@Injectable()
export class AssignmentPreviewUseCase {
  constructor(private readonly prisma: PrismaService) {}
  async execute(batchId: string, reviewerIds: unknown) {
    if (
      !Array.isArray(reviewerIds) ||
      !reviewerIds.length ||
      reviewerIds.some((id) => typeof id !== 'string' || !isUUID(id)) ||
      new Set(reviewerIds).size !== reviewerIds.length
    )
      throw new BadRequestException('Danh sách giảng viên A không hợp lệ');
    return this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.itemBatch.findUnique({
          where: { id: batchId },
          select: { status: true },
        });
        if (!batch) throw new NotFoundException('Không tìm thấy lô');
        if (batch.status !== 'READY_TO_ASSIGN')
          throw new ConflictException('Lô không ở trạng thái chờ giao việc');
        const count = await tx.user.count({
          where: {
            id: { in: reviewerIds },
            role: UserRole.TEACHER,
            isActive: true,
          },
        });
        if (count !== reviewerIds.length)
          throw new BadRequestException(
            'Giảng viên không tồn tại hoặc không hoạt động',
          );
        const items = await tx.item.findMany({
          where: { batchId, status: 'DRAFT' },
          select: {
            id: true,
            content: true,
            skill: true,
            cefrTarget: true,
            createdAt: true,
          },
        });
        if (!items.length)
          throw new ConflictException('Lô không có câu chờ giao');
        const ordered = orderedAssignmentItems(items);
        const contentById = new Map(
          items.map((item) => [item.id, item.content]),
        );
        return {
          batchRevision: assignmentRevision(batch.status, items),
          assignments: ordered.map((item, index) => ({
            itemId: item.id,
            content: contentById.get(item.id),
            reviewerId: reviewerIds[index % reviewerIds.length],
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
