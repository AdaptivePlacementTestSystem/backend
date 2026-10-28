import { Skill } from '../../../item-bank/domain/enums/skill.enum';
import { ItemEntity } from '../../../item-bank/domain/entities/item.entity';
import { AbilityEstimateEntity } from '../entities/ability-estimate.entity';

export interface StoppingCriterionResult {
  shouldStop: boolean;
  reason?: 'MAX_ITEMS_REACHED' | 'SE_THRESHOLD' | 'ITEM_BANK_BOUNDARY' | 'TIMEOUT';
}

export interface ICATEngineDomainService {
  pickNextSkill(lastSkillPicked: Skill | null): Skill;
  selectNextItem(candidates: ItemEntity[]): ItemEntity | null;
  computeEAP(responses: Array<{ irtB: number; isCorrect: boolean }>): AbilityEstimateEntity;
  checkStoppingCriterion(params: {
    itemCount: number;
    standardError: number;
    currentTheta: number;
    expiresAt: Date;
    recentThetaDelta?: number[];
  }): StoppingCriterionResult;
}
