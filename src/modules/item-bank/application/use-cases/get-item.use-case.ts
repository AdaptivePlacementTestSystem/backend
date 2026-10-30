import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import type { IItemRepository } from '../../domain/repositories/item.repository.interface';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

@Injectable()
export class GetItemUseCase {
  constructor(
    @Inject('IItemRepository')
    private readonly itemRepository: IItemRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(itemId: string) {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      include: {
        explanation: true,
        batch: { select: { id: true, source: true } },
      },
    });

    if (!item) {
      throw new NotFoundException('Không tìm thấy câu hỏi');
    }

    return {
      id: item.id,
      content: item.content,
      options: item.options,
      correctAnswer: item.correctAnswer,
      skill: item.skill,
      cefrTarget: item.cefrTarget,
      irtB: item.irtB,
      status: item.status,
      batchId: item.batchId,
      source: item.batch.source,
      packageId: item.packageId,
      topicTag: item.topicTag,
      timesUsed: item.timesUsed,
      explanation: item.explanation?.content ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
