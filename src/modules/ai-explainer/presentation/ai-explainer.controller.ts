import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ExplainItemUseCase } from '../application/use-cases/explain-item.use-case';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOkResponse, ApiProperty } from '@nestjs/swagger';

class ItemExplanationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() itemId: string;
  @ApiProperty() content: string;
  @ApiProperty({ format: 'date-time' }) generatedAt: string;
}

@Controller('explanations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class AiExplainerController {
  constructor(private readonly explainItemUseCase: ExplainItemUseCase) {}

  @Get('items/:itemId')
  @ApiOkResponse({ type: ItemExplanationResponseDto })
  async getExplanation(@Param('itemId') itemId: string) {
    return this.explainItemUseCase.execute(itemId);
  }
}
