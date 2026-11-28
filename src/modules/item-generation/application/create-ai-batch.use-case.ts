import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CEFRLevel, Prisma, Skill } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { resolveGatewayKey } from '../../llm-gateway/infrastructure/openai-compatible-url';
import { ConfigService } from '@nestjs/config';

type Input = {
  name?: string;
  skill: Skill;
  cefrTarget: CEFRLevel;
  topicTag?: string;
  count: number;
  operationId: string;
};

@Injectable()
export class CreateAiBatchUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async execute(actorId: string, input: Input) {
    if (
      !input ||
      !isUUID(input.operationId) ||
      !Object.values(Skill).includes(input.skill) ||
      !Object.values(CEFRLevel).includes(input.cefrTarget) ||
      !Number.isInteger(input.count) ||
      input.count < 1 ||
      input.count > this.config.getOrThrow<number>('AI_GENERATION_MAX_ITEMS') ||
      (input.name !== undefined &&
        (typeof input.name !== 'string' || input.name.length > 100)) ||
      (input.topicTag !== undefined &&
        (typeof input.topicTag !== 'string' || input.topicTag.length > 50))
    )
      throw new BadRequestException(
        'Thông tin lô hoặc mã thao tác không hợp lệ',
      );
    const existing = await this.findExisting(actorId, input);
    if (existing) return existing;
    const baseUrl = this.config.get<string>('LITELLM_BASE_URL')?.trim();
    if (
      !baseUrl ||
      !resolveGatewayKey(baseUrl, {
        LITELLM_API_KEY: this.config.get<string>('LITELLM_API_KEY'),
        GEMINI_API_KEY: this.config.get<string>('GEMINI_API_KEY'),
      }) ||
      !this.config.get<string>('LITELLM_MODEL')?.trim()
    )
      throw new ServiceUnavailableException(
        'Chưa cấu hình dịch vụ AI cho tạo câu hỏi',
      );
    try {
      return await this.prisma.$transaction(async (tx) => {
        const batch = await tx.itemBatch.create({
          data: {
            source: 'AI_GENERATED',
            createdById: actorId,
            name: input.name?.trim() || null,
            skill: input.skill,
            cefrTarget: input.cefrTarget,
            topicTag: input.topicTag?.trim() || null,
            requestedCount: input.count,
            status: 'GENERATING',
          },
        });
        await tx.itemBatchJob.create({
          data: { id: input.operationId, batchId: batch.id, kind: 'GENERATE' },
        });
        return { batchId: batch.id, status: batch.status };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const prior = await this.findExisting(actorId, input);
        if (prior) return prior;
      }
      throw error;
    }
  }

  private async findExisting(actorId: string, input: Input) {
    const job = await this.prisma.itemBatchJob.findUnique({
      where: { id: input.operationId },
      include: { batch: true },
    });
    if (!job) return null;
    const batch = job.batch;
    if (
      job.kind !== 'GENERATE' ||
      batch.createdById !== actorId ||
      batch.source !== 'AI_GENERATED' ||
      batch.name !== (input.name?.trim() || null) ||
      batch.skill !== input.skill ||
      batch.cefrTarget !== input.cefrTarget ||
      batch.topicTag !== (input.topicTag?.trim() || null) ||
      batch.requestedCount !== input.count
    )
      throw new ConflictException('Mã thao tác đã được dùng cho yêu cầu khác');
    return { batchId: batch.id, status: batch.status };
  }
}
