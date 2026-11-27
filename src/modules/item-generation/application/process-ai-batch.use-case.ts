import { ConflictException, Injectable } from '@nestjs/common';
import { CEFRLevel, Prisma, Skill } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { LiteLlmClient } from '../../llm-gateway/infrastructure/litellm-client';
import { resolveGatewayKey } from '../../llm-gateway/infrastructure/openai-compatible-url';
import { checkGeneratedBatch } from '../domain/check-generated-batch';
import { contentFingerprint } from '../domain/content-fingerprint';
import { assertJobLease, type JobLease } from '../infrastructure/job-lease';
import { reserveAiCall } from '../infrastructure/ai-budget';

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
export class ProcessAiBatchUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(batchId: string, lease: JobLease): Promise<void> {
    if (lease.batchId !== batchId) throw new Error('JOB_BATCH_MISMATCH');
    const batch = await this.prisma.itemBatch.findUnique({
      where: { id: batchId },
    });
    if (
      !batch ||
      batch.source !== 'AI_GENERATED' ||
      batch.status !== 'GENERATING' ||
      !batch.skill ||
      !batch.cefrTarget ||
      !batch.requestedCount
    )
      throw new ConflictException('Lô không ở trạng thái sinh câu');
    const baseUrl = process.env.LITELLM_BASE_URL?.trim();
    const apiKey = resolveGatewayKey(baseUrl);
    const model = process.env.LITELLM_MODEL?.trim();
    if (!baseUrl || !apiKey || !model) throw new Error('AI_NOT_CONFIGURED');
    const referenceLimit = Number(process.env.AI_REFERENCE_EXAMPLES ?? 5);
    if (
      !Number.isInteger(referenceLimit) ||
      referenceLimit < 3 ||
      referenceLimit > 5
    )
      throw new Error('AI_NOT_CONFIGURED');
    const samples = await this.prisma.item.findMany({
      where: {
        status: 'FINAL_APPROVED',
        skill: batch.skill,
        cefrTarget: batch.cefrTarget,
      },
      select: {
        id: true,
        content: true,
        options: true,
        correctAnswer: true,
        irtB: true,
      },
      take: referenceLimit,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    if (samples.length < 3) throw new Error('INSUFFICIENT_REFERENCE_ITEMS');
    const client = new LiteLlmClient({
      baseUrl,
      apiKey,
      model,
      timeoutMs: 90000,
      maxPromptChars: 20000,
      maxResponseBytes: 262144,
      maxOutputTokens: 8192,
    });
    const examples = samples.map(({ id: _id, ...sample }) => sample);
    const prompt = `Generate ${batch.requestedCount} original English multiple-choice questions for ${batch.skill}, CEFR ${batch.cefrTarget}, topic ${JSON.stringify(batch.topicTag ?? '')}. Use the following examples only as guidance; do not copy them. Each question must have exactly four distinct options A-D, exactly one correct answer and a clear explanation. Return only a JSON array of objects with content, options, correctAnswer, explanation, skill, cefrTarget, and numeric irtB between -4 and 4. Examples: ${JSON.stringify(examples)}`;
    await reserveAiCall(this.prisma, batchId, lease);
    const response = await client.generate(prompt);
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw new Error('AI_OUTPUT_INVALID');
    }
    if (
      !Array.isArray(parsed) ||
      parsed.length < 1 ||
      parsed.length > batch.requestedCount * 2
    )
      throw new Error('AI_OUTPUT_INVALID');
    const validation = checkGeneratedBatch(
      parsed,
      batch.skill,
      batch.cefrTarget,
    );
    const accepted = parsed
      .filter((_, index) => validation[index]?.errors.length === 0)
      .slice(0, batch.requestedCount) as Candidate[];
    const average =
      samples.reduce((sum, sample) => sum + sample.irtB, 0) / samples.length;
    await this.prisma.$transaction(async (tx) => {
      await assertJobLease(tx, lease);
      const updated = await tx.itemBatch.updateMany({
        where: { id: batchId, status: 'GENERATING' },
        data: { status: accepted.length ? 'CHECKING' : 'FAILED' },
      });
      if (updated.count !== 1)
        throw new ConflictException('Trạng thái lô đã thay đổi');
      for (const item of accepted)
        await tx.item.create({
          data: {
            batchId,
            content: item.content.trim(),
            options: item.options as Prisma.InputJsonObject,
            correctAnswer: item.correctAnswer,
            explanation: { create: { content: item.explanation.trim() } },
            skill: batch.skill!,
            cefrTarget: batch.cefrTarget!,
            topicTag: batch.topicTag,
            irtB: average,
            contentHash: contentFingerprint(item),
            status: 'DRAFT',
            generatedFromRefIds: samples.map((sample) => sample.id),
          },
        });
      if (accepted.length)
        await tx.itemBatchJob.create({ data: { batchId, kind: 'CHECK' } });
    });
  }
}
