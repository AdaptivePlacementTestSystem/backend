import { Injectable } from '@nestjs/common';
import { ListItemsUseCase } from '../use-cases/list-items.use-case';
import { GetItemUseCase } from '../use-cases/get-item.use-case';
import {
  GenerateExplanationUseCase,
  GenerateExplanationDto,
} from '../use-cases/generate-explanation.use-case';
import { ItemFilterOptions } from '../../domain/repositories/item.repository.interface';
import { ItemEntity } from '../../domain/entities/item.entity';

/**
 * ItemService (Facade) — chỉ đọc. CRUD bằng form đã bị vô hiệu hóa (DC-32);
 * luồng duyệt A/B theo lô/gói sẽ bổ sung ở module lô câu hỏi.
 */
@Injectable()
export class ItemService {
  constructor(
    private readonly listItemsUseCase: ListItemsUseCase,
    private readonly getItemUseCase: GetItemUseCase,
    private readonly generateExplanationUseCase: GenerateExplanationUseCase,
  ) {}

  async getItem(id: string) {
    return this.getItemUseCase.execute(id);
  }

  async listItems(options?: ItemFilterOptions): Promise<ItemEntity[]> {
    return this.listItemsUseCase.execute(options);
  }

  async generateExplanation(
    dto: GenerateExplanationDto,
  ): Promise<{ explanation: string }> {
    return this.generateExplanationUseCase.execute(dto);
  }
}
