import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
/** Chỉ trả câu được giao; vai B phải chờ A hoàn tất mọi câu của mình trong lô. */
@Injectable()
export class TeacherItemAccess {
  constructor(private readonly prisma: PrismaService) {}
  async allowedIds(userId: string): Promise<string[]> {
    const assigned = await this.prisma.item.findMany({
      where: {
        OR: [
          { reviewerId: userId },
          {
            confirmerId: userId,
            status: {
              in: ['FIRST_APPROVED', 'SECOND_APPROVED', 'FINAL_APPROVED'],
            },
          },
        ],
      },
      select: { id: true, batchId: true, reviewerId: true, confirmerId: true },
    });
    const bItems = assigned.filter(
      (item) => item.confirmerId === userId && item.reviewerId,
    );
    const pending = bItems.length
      ? await this.prisma.item.findMany({
          where: {
            status: 'DRAFT',
            OR: bItems.map((item) => ({
              batchId: item.batchId,
              reviewerId: item.reviewerId,
            })),
          },
          select: { batchId: true, reviewerId: true },
          distinct: ['batchId', 'reviewerId'],
        })
      : [];
    const blocked = new Set(
      pending.map((item) => `${item.batchId}:${item.reviewerId}`),
    );
    return assigned
      .filter(
        (item) =>
          item.reviewerId === userId ||
          (item.confirmerId === userId &&
            !blocked.has(`${item.batchId}:${item.reviewerId}`)),
      )
      .map((item) => item.id);
  }
  async assertAllowed(userId: string, itemId: string) {
    if (!(await this.allowedIds(userId)).includes(itemId))
      throw new ForbiddenException('Câu hỏi không thuộc phân công');
  }
}
