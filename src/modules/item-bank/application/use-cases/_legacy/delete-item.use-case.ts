// VÔ HIỆU HÓA (DC-32, #106): CRUD câu hỏi bằng form đã bỏ; câu hỏi chỉ vào hệ thống qua lô (AI sinh / import file).
// Giữ làm tham khảo cho luồng duyệt A/B ở đợt module lô/gói; KHÔNG biên dịch (loại khỏi tsconfig, vitest). Import tương đối đã lệch một cấp.
import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import type { IItemRepository } from '../../domain/repositories/item.repository.interface';
import { ItemStatus } from '@apt/shared-types';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

@Injectable()
export class DeleteItemUseCase {
  constructor(
    @Inject('IItemRepository')
    private readonly itemRepository: IItemRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(itemId: string): Promise<void> {
    const existing = await this.itemRepository.findById(itemId);
    if (!existing) {
      throw new NotFoundException('Không tìm thấy câu hỏi');
    }

    // SRS v3.0 (Quyết định #75 & K3b): Cấm xóa câu FINAL_APPROVED hoặc đã có sinh viên làm bài
    const responseCount = await this.prisma.sessionResponse.count({
      where: { itemId },
    });
    if (
      responseCount > 0 ||
      existing.isApproved() ||
      existing.status === ItemStatus.FINAL_APPROVED
    ) {
      throw new ConflictException(
        'Không thể xóa câu hỏi đã được duyệt hoặc đã có sinh viên làm bài trong hệ thống',
      );
    }

    // Xóa explanation liên quan trước nếu có
    await this.prisma.explanation.deleteMany({
      where: { itemId },
    });

    await this.prisma.item.delete({
      where: { id: itemId },
    });
  }
}
