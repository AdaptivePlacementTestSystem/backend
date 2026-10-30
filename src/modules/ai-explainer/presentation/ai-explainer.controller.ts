import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ExplainItemUseCase } from '../application/use-cases/explain-item.use-case';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';

@Controller('explanations')
@UseGuards(JwtAuthGuard)
export class AiExplainerController {
  constructor(private readonly explainItemUseCase: ExplainItemUseCase) {}

  @Get('items/:itemId')
  async getExplanation(@Param('itemId') itemId: string) {
    return this.explainItemUseCase.execute(itemId);
  }
}
