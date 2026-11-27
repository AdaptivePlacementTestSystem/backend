import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

/** GV A thấy câu được giao; GV B thấy câu đã được A duyệt theo phân công hiện hành của lô. */
@Injectable()
export class TeacherItemAccess {
  constructor(private readonly prisma: PrismaService) {}

  async allowedIds(userId: string): Promise<string[]> {
    const items = await this.prisma.item.findMany({
      where: {
        OR: [
          { reviewerId: userId },
          {
            batch: { confirmerId: userId },
            status: {
              in: ['FIRST_APPROVED', 'SECOND_APPROVED', 'FINAL_APPROVED'],
            },
          },
        ],
      },
      select: { id: true },
    });
    return items.map((item) => item.id);
  }

  async assertAllowed(userId: string, itemId: string) {
    if (!(await this.allowedIds(userId)).includes(itemId))
      throw new ForbiddenException('Câu hỏi không thuộc phân công');
  }
}
