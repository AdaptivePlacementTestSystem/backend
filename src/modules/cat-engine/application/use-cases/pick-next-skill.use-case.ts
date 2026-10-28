import { Injectable } from '@nestjs/common';
import { Skill } from '../../../item-bank/domain/enums/skill.enum';

/**
 * F-03: CAT Engine — pickNextSkill()
 * Quy tắc đã chốt (Luong_Hoat_Dong_CATEngine.md Mục II):
 * - Câu 1: random 50/50 giữa VOCABULARY và GRAMMAR.
 * - Từ câu 2: xen kẽ (alternate) cố định dựa trên lastSkillPicked.
 */
@Injectable()
export class PickNextSkillUseCase {
  execute(lastSkillPicked: Skill | null, randomSource: () => number = Math.random): Skill {
    if (!lastSkillPicked) {
      return randomSource() < 0.5 ? Skill.VOCABULARY : Skill.GRAMMAR;
    }

    return lastSkillPicked === Skill.VOCABULARY ? Skill.GRAMMAR : Skill.VOCABULARY;
  }
}
