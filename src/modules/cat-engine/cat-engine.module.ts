import { Module } from '@nestjs/common';
import { PickNextSkillUseCase } from './application/use-cases/pick-next-skill.use-case';
import { SelectNextItemUseCase } from './application/use-cases/select-next-item.use-case';
import { ComputeEapUseCase } from './application/use-cases/compute-eap.use-case';
import { CheckStoppingCriterionUseCase } from './application/use-cases/check-stopping-criterion.use-case';
import { CatEngineService } from './application/services/cat-engine.service';

@Module({
  providers: [
    PickNextSkillUseCase,
    SelectNextItemUseCase,
    ComputeEapUseCase,
    CheckStoppingCriterionUseCase,
    CatEngineService,
  ],
  exports: [CatEngineService],
})
export class CatEngineModule {}
