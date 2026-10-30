// VÔ HIỆU HÓA (DC-32, #106): CRUD câu hỏi bằng form đã bỏ; câu hỏi chỉ vào hệ thống qua lô (AI sinh / import file).
// Giữ làm tham khảo cho luồng duyệt A/B ở đợt module lô/gói; KHÔNG biên dịch (loại khỏi tsconfig, vitest). Import tương đối đã lệch một cấp.
import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { IItemRepository } from '../../domain/repositories/item.repository.interface';

@Injectable()
export class RejectItemUseCase {
  constructor(
    @Inject('IItemRepository')
    private readonly itemRepository: IItemRepository,
  ) {}

  async execute(itemId: string): Promise<void> {
    const item = await this.itemRepository.findById(itemId);
    if (!item) {
      throw new NotFoundException(`Không tìm thấy câu hỏi với ID: ${itemId}`);
    }

    item.reject();
    await this.itemRepository.reject(itemId);
  }
}
