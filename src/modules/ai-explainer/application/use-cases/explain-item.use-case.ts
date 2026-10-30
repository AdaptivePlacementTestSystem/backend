import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { GeminiFlashProvider } from '../../infrastructure/providers/gemini-flash.provider';
import { ExplanationEntity } from '../../domain/entities/explanation.entity';
import { randomUUID } from 'crypto';

@Injectable()
export class ExplainItemUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiProvider: GeminiFlashProvider,
  ) {}

  async execute(itemId: string): Promise<ExplanationEntity> {
    const existing = await this.prisma.explanation.findUnique({
      where: { itemId },
    });

    if (existing) {
      return new ExplanationEntity(
        existing.id,
        existing.itemId,
        existing.content,
        existing.generatedAt,
      );
    }

    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundException(`Không tìm thấy câu hỏi với ID: ${itemId}`);
    }

    const content = await this.geminiProvider.generateExplanation({
      content: item.content,
      options: item.options as Record<string, string>,
      correctAnswer: item.correctAnswer,
      skill: item.skill,
    });

    const explanationId = randomUUID();
    const saved = await this.prisma.explanation.upsert({
      where: { itemId },
      create: {
        id: explanationId,
        itemId,
        content,
      },
      update: {
        content,
      },
    });

    return new ExplanationEntity(
      saved.id,
      saved.itemId,
      saved.content,
      saved.generatedAt,
    );
  }
}
