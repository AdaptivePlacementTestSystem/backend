import { Injectable } from '@nestjs/common';
import { ItemEntity } from '../../../item-bank/domain/entities/item.entity';

/**
 * F-03: CAT Engine — selectNextItem()
 * Thuật toán: Randomized Top-5 b-matching (SRS Mục 4.4)
 * Chọn ngẫu nhiên đều 1 câu từ pool ứng viên (Top-N gần θ nhất).
 *
 * Lưu ý quan trọng (Quyết định #16):
 * Use case này là PURE QUERY, KHÔNG có tác dụng phụ (không tăng times_used tại đây).
 * times_used chỉ được tăng ở submit-response để tránh đếm trùng khi refresh.
 */
@Injectable()
export class SelectNextItemUseCase {
  execute(
    candidates: ItemEntity[],
    randomSource: () => number = Math.random,
  ): ItemEntity | null {
    if (!candidates || candidates.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(randomSource() * candidates.length);
    return candidates[randomIndex];
  }
}
