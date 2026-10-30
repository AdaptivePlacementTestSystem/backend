// VÔ HIỆU HÓA (DC-32, #106): CRUD câu hỏi bằng form đã bỏ; câu hỏi chỉ vào hệ thống qua lô (AI sinh / import file).
// Giữ làm tham khảo cho luồng duyệt A/B ở đợt module lô/gói; KHÔNG biên dịch (loại khỏi tsconfig, vitest). Import tương đối đã lệch một cấp.
import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import type { IItemRepository } from '../../domain/repositories/item.repository.interface';
import { ItemEntity } from '../../domain/entities/item.entity';
import { ItemStatus } from '@apt/shared-types';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { randomUUID } from 'crypto';

@Injectable()
export class CloneItemUseCase {
  constructor(
    @Inject('IItemRepository')
    private readonly itemRepository: IItemRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(itemId: string): Promise<ItemEntity> {
    const original = await this.itemRepository.findById(itemId);
    if (!original) {
      throw new NotFoundException('Không tìm thấy câu hỏi để nhân bản');
    }

    const newId = randomUUID();
    const cloned = new ItemEntity(
      newId,
      original.content,
      original.options,
      original.correctAnswer,
      original.skill,
      original.cefrTarget,
      original.irtB,
      original.irtA,
      original.irtC,
      ItemStatus.DRAFT, // Quyết định #64 & #75: Bản sao bắt đầu ở DRAFT
      original.batchId,
      original.packageId,
      original.contentHash,
      original.topicTag,
      null, // approvedById
      null, // approvedAt
      0, // timesUsed reset về 0
      false, // calibrated reset về false
    );

    const saved = await this.itemRepository.save(cloned);

    // Sao chép explanation nếu câu gốc có
    const originalExp = await this.prisma.explanation.findUnique({
      where: { itemId },
    });
    if (originalExp) {
      await this.prisma.explanation.create({
        data: {
          id: randomUUID(),
          itemId: newId,
          content: originalExp.content,
        },
      });
    }

    return saved;
  }
}
