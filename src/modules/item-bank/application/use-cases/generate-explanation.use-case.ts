import { Injectable } from '@nestjs/common';
import { GeminiFlashProvider } from '../../../ai-explainer/infrastructure/providers/gemini-flash.provider';
import { IsNotEmpty, IsObject, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateExplanationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  @IsObject()
  options: Record<string, string>;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  correctAnswer: string;

  @ApiProperty()
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
