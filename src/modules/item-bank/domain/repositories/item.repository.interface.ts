import { ItemEntity } from '../entities/item.entity';
import { Skill } from '../enums/skill.enum';
import { ItemStatus } from '../enums/item-status.enum';

export interface ItemFilterOptions {
  status?: ItemStatus;
  skill?: Skill;
  limit?: number;
  offset?: number;
}

export interface IItemRepository {
  findById(id: string): Promise<ItemEntity | null>;
  findAll(options?: ItemFilterOptions): Promise<ItemEntity[]>;
  incrementTimesUsed(id: string): Promise<void>;

  /**
   * BẮT BUỘC filter WHERE status = 'FINAL_APPROVED' tại tầng Repository.
   * Lấy Top-N (mặc định 5) ứng viên gần theta nhất chưa được sử dụng.
   */
  findForCAT(skill: Skill, usedIds: string[], theta: number, limit?: number): Promise<ItemEntity[]>;
}
