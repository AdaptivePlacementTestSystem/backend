import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CEFRLevel, Prisma, Skill } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { LiteLlmClient } from '../../llm-gateway/infrastructure/litellm-client';
import { checkGeneratedBatch } from '../domain/check-generated-batch';
import { RunBatchChecksUseCase } from './run-batch-checks.use-case';

type Input = {
  name?: string;
  skill: Skill;
  cefrTarget: CEFRLevel;
  topicTag?: string;
  count: number;
};
type Candidate = {
  content: string;
  options: Record<string, string>;
  correctAnswer: string;
  explanation: string;
  skill: Skill;
  cefrTarget: CEFRLevel;
  irtB: number;
};
@Injectable()
export class CreateAiBatchUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runChecks: RunBatchChecksUseCase,
  ) {}
  async execute(actorId: string, input: Input) {
    if (
      !input ||
      !Object.values(Skill).includes(input.skill) ||
      !Object.values(CEFRLevel).includes(input.cefrTarget) ||
      !Number.isInteger(input.count) ||
      input.count < 1 ||
      input.count > 20 ||
      (input.name !== undefined &&
        (typeof input.name !== 'string' || input.name.length > 100)) ||
      (input.topicTag !== undefined &&
        (typeof input.topicTag !== 'string' || input.topicTag.length > 50))
    )
      throw new BadRequestException(
        'Thông tin lô không hợp lệ (số câu từ 1 đến 20)',
      );
    const url = process.env.LITELLM_BASE_URL,
      apiKey = process.env.LITELLM_API_KEY,
      model = process.env.LITELLM_MODEL;
    if (!url || !apiKey || !model)
      throw new ServiceUnavailableException(
        'Chưa cấu hình cổng LiteLLM cho tạo câu hỏi',
      );
    let client: LiteLlmClient;
    try {
      client = new LiteLlmClient({
        baseUrl: url,
        apiKey,
        model,
        timeoutMs: 90000,
        maxPromptChars: 20000,
        maxResponseBytes: 262144,
        maxOutputTokens: 8192,
      });
    } catch {
      throw new ServiceUnavailableException(
        'Cấu hình cổng LiteLLM không hợp lệ',
      );
    }
    const batch = await this.prisma.itemBatch.create({
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
    try {
      const samples = await this.prisma.item.findMany({
        where: {
          status: 'FINAL_APPROVED',
          skill: input.skill,
          cefrTarget: input.cefrTarget,
        },
        select: {
          content: true,
          options: true,
          correctAnswer: true,
          irtB: true,
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
      });
      const prompt = `Generate ${input.count} original English multiple-choice questions. Return only a JSON array; each entry must have content, options object with A B C D, correctAnswer (A/B/C/D), explanation, skill, cefrTarget, irtB (number between -4 and 4). skill=${input.skill}; cefrTarget=${input.cefrTarget}; topic=${JSON.stringify(input.topicTag || '')}. Example questions: ${JSON.stringify(samples)}`;
      const response = await client.generate(prompt);
      const parsed: unknown = JSON.parse(response.content);
      if (
        !Array.isArray(parsed) ||
        parsed.length < 1 ||
        parsed.length > input.count * 2
      )
        throw new Error('INVALID_RESPONSE');
      const checks = checkGeneratedBatch(parsed, input.skill, input.cefrTarget);
      const accepted = parsed
        .filter((_, i) => checks[i]?.errors.length === 0)
        .slice(0, input.count) as Candidate[];
      const avg = samples.length
        ? samples.reduce((sum, sample) => sum + sample.irtB, 0) / samples.length
        : null;
      await this.prisma.$transaction(async (tx) => {
        for (const item of accepted) {
          const hash = createHash('sha256')
            .update(
              item.content
                .normalize('NFKC')
                .trim()
                .replace(/\s+/g, ' ')
                .toLowerCase(),
            )
            .digest('hex');
          await tx.item.create({
            data: {
              batchId: batch.id,
              content: item.content.trim(),
              options: item.options as Prisma.InputJsonObject,
              correctAnswer: item.correctAnswer,
              explanation: { create: { content: item.explanation.trim() } },
              skill: input.skill,
              cefrTarget: input.cefrTarget,
              topicTag: input.topicTag?.trim() || null,
              irtB: avg ?? item.irtB,
              contentHash: hash,
              status: 'DRAFT',
            },
          });
        }
        // Không mở giao việc khi các tầng C1 chưa được chạy.
        await tx.itemBatch.update({
          where: { id: batch.id },
          data: { status: accepted.length ? 'CHECKING' : 'FAILED' },
        });
      });
      const dupChecks = await this.runChecks.execute(batch.id, 'C1');
      const checkRejected = dupChecks.exactRejected + dupChecks.nearRejected;
      return {
        batchId: batch.id,
        accepted: accepted.length - checkRejected,
        rejected: parsed.length - accepted.length + checkRejected,
        status: dupChecks.status,
        nearFlagged: dupChecks.nearFlagged,
        semanticFlagged: dupChecks.semanticFlagged,
      };
    } catch {
      await this.prisma.itemBatch.update({
        where: { id: batch.id },
        data: { status: 'FAILED' },
      });
      throw new ServiceUnavailableException(
        `Không tạo được lô ${batch.id}; vui lòng kiểm tra cấu hình dịch vụ AI`,
      );
    }
  }
}
