// VÔ HIỆU HÓA (DC-32, #106): CRUD câu hỏi bằng form đã bỏ; câu hỏi chỉ vào hệ thống qua lô (AI sinh / import file).
// Giữ làm tham khảo cho luồng duyệt A/B ở đợt module lô/gói; KHÔNG biên dịch (loại khỏi tsconfig, vitest). Import tương đối đã lệch một cấp.
import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import type { IItemRepository } from '../../domain/repositories/item.repository.interface';
import { ItemEntity } from '../../domain/entities/item.entity';
import { ItemStatus } from '@apt/shared-types';
import { CreateItemDto } from './create-item.use-case';

@Injectable()
export class UpdateItemUseCase {
  constructor(
    @Inject('IItemRepository')
    private readonly itemRepository: IItemRepository,
  ) {}

  async execute(itemId: string, dto: Partial<CreateItemDto>): Promise<ItemEntity> {
    const existing = await this.itemRepository.findById(itemId);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy câu hỏi');
    }

    // SRS v3.0 (Quyết định #64 & #75): CẤM sửa câu FINAL_APPROVED
    if (existing.isApproved() || existing.status === ItemStatus.FINAL_APPROVED) {
      throw new BadRequestException(
        'Câu hỏi đã được duyệt không thể sửa trực tiếp. Vui lòng nhân bản (clone) để tạo phiên bản mới.',
      );
    }

    const updated = new ItemEntity(
      existing.id,
      dto.content ?? existing.content,
      (dto.options ?? existing.options) as any,
      dto.correctAnswer ?? existing.correctAnswer,
      dto.skill ?? existing.skill,
      dto.cefrTarget ?? existing.cefrTarget,
      dto.irtB ?? existing.irtB,
      existing.irtA,
      existing.irtC,
      existing.status,
      existing.batchId,
      existing.packageId,
      existing.contentHash,
      dto.topicTag !== undefined ? dto.topicTag : existing.topicTag,
      existing.approvedById,
      existing.approvedAt,
      existing.timesUsed,
      existing.calibrated,
    );

    return this.itemRepository.save(updated);
  }
}
