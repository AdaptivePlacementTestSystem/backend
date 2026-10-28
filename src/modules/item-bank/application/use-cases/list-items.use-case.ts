import { Injectable, Inject } from '@nestjs/common';
import type { IItemRepository, ItemFilterOptions } from '../../domain/repositories/item.repository.interface';
import { ItemEntity } from '../../domain/entities/item.entity';

@Injectable()
export class ListItemsUseCase {
  constructor(
    @Inject('IItemRepository')
    private readonly itemRepository: IItemRepository,
  ) {}

  async execute(options?: ItemFilterOptions): Promise<ItemEntity[]> {
    return this.itemRepository.findAll(options);
  }
}
