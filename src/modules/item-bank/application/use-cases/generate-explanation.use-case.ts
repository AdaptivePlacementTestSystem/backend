import { Injectable } from '@nestjs/common';
import { GeminiFlashProvider } from '../../../ai-explainer/infrastructure/providers/gemini-flash.provider';
import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class GenerateExplanationDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsObject()
  options: Record<string, string>;

  @IsString()
  @IsNotEmpty()
  correctAnswer: string;

  @IsString()
  @IsNotEmpty()
  skill: string;
}

@Injectable()
export class GenerateExplanationUseCase {
  constructor(private readonly geminiProvider: GeminiFlashProvider) {}

  async execute(dto: GenerateExplanationDto): Promise<{ explanation: string }> {
    const explanation = await this.geminiProvider.generateExplanation(dto);
    return { explanation };
  }
}
