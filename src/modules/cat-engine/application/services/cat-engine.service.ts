import { Injectable } from '@nestjs/common';
import { ICATEngineDomainService, StoppingCriterionResult } from '../../domain/services/cat-engine.domain-service';
import { PickNextSkillUseCase } from '../use-cases/pick-next-skill.use-case';
import { SelectNextItemUseCase } from '../use-cases/select-next-item.use-case';
import { ComputeEapUseCase, ItemResponseInput } from '../use-cases/compute-eap.use-case';
import { CheckStoppingCriterionUseCase, CheckStoppingParams } from '../use-cases/check-stopping-criterion.use-case';
import { Skill } from '../../../item-bank/domain/enums/skill.enum';
import { ItemEntity } from '../../../item-bank/domain/entities/item.entity';
import { AbilityEstimateEntity } from '../../domain/entities/ability-estimate.entity';

/**
 * CATEngineService — <<service>> điều phối 4 hành vi lõi của thuật toán CAT.
 * Không lưu state, thuần túy tính toán nhận input và trả output.
 */
@Injectable()
export class CatEngineService implements ICATEngineDomainService {
  constructor(
    private readonly pickNextSkillUseCase: PickNextSkillUseCase,
    private readonly selectNextItemUseCase: SelectNextItemUseCase,
    private readonly computeEapUseCase: ComputeEapUseCase,
    private readonly checkStoppingCriterionUseCase: CheckStoppingCriterionUseCase,
  ) {}

  pickNextSkill(lastSkillPicked: Skill | null): Skill {
    return this.pickNextSkillUseCase.execute(lastSkillPicked);
  }

  selectNextItem(candidates: ItemEntity[]): ItemEntity | null {
    return this.selectNextItemUseCase.execute(candidates);
  }

  computeEAP(responses: ItemResponseInput[]): AbilityEstimateEntity {
    return this.computeEapUseCase.execute(responses);
  }

  checkStoppingCriterion(params: CheckStoppingParams): StoppingCriterionResult {
    return this.checkStoppingCriterionUseCase.execute(params);
  }
}
