import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { LiteLlmClient } from '../../llm-gateway/infrastructure/litellm-client';
import { resolveGatewayKey } from '../../llm-gateway/infrastructure/openai-compatible-url';
import { contentFingerprint } from '../domain/content-fingerprint';
import { Prisma } from '@prisma/client';
import { assertJobLease, type JobLease } from '../infrastructure/job-lease';
import { reserveAiCall } from '../infrastructure/ai-budget';

/** G5: yêu cầu mô hình tự chọn đáp án, không gửi đáp án do người tạo cung cấp. */
@Injectable()
export class CheckIndependentAnswerUseCase {
  constructor(private readonly prisma: PrismaService) {}

  private async writeWithLease<T>(
    lease: JobLease | undefined,
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!lease) return action(this.prisma);
    return this.prisma.$transaction(async (tx) => {
      await assertJobLease(tx, lease);
      return action(tx);
    });
  }

  async execute(
    batchId: string,
    checkpoint: 'C1' | 'C2' | 'C3',
    lease?: JobLease,
  ) {
    if (lease && lease.batchId !== batchId)
      throw new Error('JOB_BATCH_MISMATCH');
    const baseUrl = process.env.LITELLM_BASE_URL?.trim();
    const apiKey = resolveGatewayKey(baseUrl);
    const model = process.env.LITELLM_MODEL?.trim();
    if (!baseUrl || !apiKey || !model)
      throw new ServiceUnavailableException(
        'Chưa cấu hình dịch vụ AI kiểm tra đáp án; hãy thử lại sau',
      );
    const client = new LiteLlmClient({
      baseUrl,
      apiKey,
      model,
      timeoutMs: 90000,
      maxPromptChars: 20000,
      maxResponseBytes: 262144,
      maxOutputTokens: 1024,
    });
    const items = await this.prisma.item.findMany({
      where: {
        batchId,
        status: checkpoint === 'C3' ? 'SECOND_APPROVED' : 'DRAFT',
      },
      select: {
        id: true,
        content: true,
        options: true,
        correctAnswer: true,
        contentHash: true,
        explanation: { select: { content: true } },
      },
    });
    let flagged = 0;
    for (const item of items) {
      if (
        !item.explanation?.content ||
        !item.options ||
        typeof item.options !== 'object' ||
        Array.isArray(item.options) ||
        ['A', 'B', 'C', 'D'].some(
          (key) =>
            typeof (item.options as Record<string, unknown>)[key] !== 'string',
        )
      )
        throw new ServiceUnavailableException(
          'Câu hỏi thiếu dữ liệu kiểm tra; chưa thể giao việc',
        );
      const fingerprint = contentFingerprint({
        content: item.content,
        options: item.options as Record<string, string>,
        correctAnswer: item.correctAnswer,
        explanation: item.explanation.content,
      });
      if (fingerprint !== item.contentHash) {
        const updated = await this.writeWithLease(lease, (tx) =>
          tx.item.updateMany({
            where: {
              id: item.id,
              status: checkpoint === 'C3' ? 'SECOND_APPROVED' : 'DRAFT',
              contentHash: item.contentHash,
            },
            data: { contentHash: fingerprint },
          }),
        );
        if (updated.count !== 1)
          throw new ServiceUnavailableException(
            'Câu hỏi đã thay đổi, vui lòng kiểm tra lại',
          );
      }
      await reserveAiCall(this.prisma, batchId, lease);
      const result = await client.generate(
        `Choose the best answer independently for this English question. Return JSON only: {"answer":"A|B|C|D"}. Question: ${JSON.stringify({ content: item.content, options: item.options })}`,
      );
      let parsed: { answer?: unknown };
      try {
        parsed = JSON.parse(result.content);
      } catch {
        throw new ServiceUnavailableException(
          'Dịch vụ AI trả kết quả kiểm tra đáp án không hợp lệ',
        );
      }
      if (
        !parsed ||
        typeof parsed.answer !== 'string' ||
        !['A', 'B', 'C', 'D'].includes(parsed.answer)
      )
        throw new ServiceUnavailableException(
          'Dịch vụ AI trả kết quả kiểm tra đáp án không hợp lệ',
        );
      await reserveAiCall(this.prisma, batchId, lease);
      const explanationResult = await client.generate(
        `Does this explanation support the independently selected answer? Return JSON only: {"explanationSupportsAnswer":true|false}. Data: ${JSON.stringify({ content: item.content, options: item.options, selectedAnswer: parsed.answer, explanation: item.explanation.content })}`,
      );
      let explanationCheck: { explanationSupportsAnswer?: unknown };
      try {
        explanationCheck = JSON.parse(explanationResult.content);
      } catch {
        throw new ServiceUnavailableException(
          'Dịch vụ AI trả kết quả kiểm tra lời giải không hợp lệ',
        );
      }
      if (
        !explanationCheck ||
        typeof explanationCheck.explanationSupportsAnswer !== 'boolean'
      )
        throw new ServiceUnavailableException(
          'Dịch vụ AI trả kết quả kiểm tra lời giải không hợp lệ',
        );
      const mismatch =
        parsed.answer !== item.correctAnswer ||
        !explanationCheck.explanationSupportsAnswer;
      if (mismatch) flagged++;
      await this.writeWithLease(lease, (tx) =>
        tx.itemCheckResult.create({
          data: {
            itemId: item.id,
            checkpoint,
            contentHash: fingerprint,
            level: mismatch ? 'SOFT' : 'PASS',
            reasonCodes: mismatch
              ? ['INDEPENDENT_ANSWER_CHECKED', 'INDEPENDENT_ANSWER_MISMATCH']
              : ['INDEPENDENT_ANSWER_CHECKED'],
          },
        }),
      );
    }
    return { checked: items.length, flagged };
  }
}
