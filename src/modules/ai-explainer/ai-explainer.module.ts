import { Module } from '@nestjs/common';
import { AiExplainerController } from './presentation/ai-explainer.controller';
import { ExplainItemUseCase } from './application/use-cases/explain-item.use-case';
import { GeminiFlashProvider } from './infrastructure/providers/gemini-flash.provider';

@Module({
  controllers: [AiExplainerController],
  providers: [ExplainItemUseCase, GeminiFlashProvider],
  exports: [ExplainItemUseCase, GeminiFlashProvider],
})
export class AiExplainerModule {}
