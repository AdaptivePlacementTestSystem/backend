import { ItemEntity } from '../entities/item.entity';
import { Skill, CEFRLevel, ItemStatus, ItemBatchSource } from '@apt/shared-types';

export interface ItemFilterOptions {
  status?: ItemStatus;
  skill?: Skill;
  cefrTarget?: CEFRLevel;
  source?: ItemBatchSource;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface IItemRepository {
  findById(id: string): Promise<ItemEntity | null>;
  findAll(options?: ItemFilterOptions): Promise<{ items: ItemEntity[]; total: number }>;
  incrementTimesUsed(id: string): Promise<void>;

  /**
   * BẮT BUỘC filter WHERE status = 'FINAL_APPROVED' tại tầng Repository.
   * Lấy Top-N (mặc định 5) ứng viên gần theta nhất chưa được sử dụng.
   */
  findForCAT(
    skill: Skill,
    usedIds: string[],
    theta: number,
    limit?: number,
  ): Promise<ItemEntity[]>;
}
