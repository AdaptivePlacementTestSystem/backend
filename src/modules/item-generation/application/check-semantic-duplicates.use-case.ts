import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { assertJobLease, type JobLease } from '../infrastructure/job-lease';
import { reserveAiCall } from '../infrastructure/ai-budget';
import {
  EMBEDDING_CLIENT,
  EmbeddingClient,
} from '../../llm-gateway/domain/embedding-client';
import { readT3Soft } from '../domain/duplicate-config';
import { cosineSimilarity } from '../domain/text-similarity';

function validVector(vector: unknown): vector is number[] {
  return (
    Array.isArray(vector) &&
    vector.length > 0 &&
    vector.every(
      (value) => typeof value === 'number' && Number.isFinite(value),
    ) &&
    vector.some((value) => value !== 0)
  );
}

/**
 * T3: trùng ngữ nghĩa bằng embedding (cosine tính trong ứng dụng, Float[]).
 * Chỉ gắn cờ SOFT. Chưa cấu hình mô hình (Q-9) thì bỏ qua và báo skipped.
 */
@Injectable()
export class CheckSemanticDuplicatesUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(EMBEDDING_CLIENT)
    private readonly embedder: EmbeddingClient | null = null,
  ) {}

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
    checkpoint: 'C1' | 'C2' | 'C3' = 'C1',
    lease?: JobLease,
  ) {
    if (lease && lease.batchId !== batchId) throw new Error('JOB_BATCH_MISMATCH');
    if (!this.embedder)
      return { skipped: true as const, checked: 0, flagged: 0 };
    const softThreshold = readT3Soft();
    const items = await this.prisma.item.findMany({
      where: {
        batchId,
        status: checkpoint === 'C3' ? 'SECOND_APPROVED' : 'DRAFT',
        contentHash: { not: null },
      },
      select: { id: true, content: true, contentHash: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (!items.length)
      return { skipped: false as const, checked: 0, flagged: 0 };
    // Embedding tính đúng một lần cho mỗi nội dung: tái dùng nếu content_hash và model không đổi.
    const existing = await this.prisma.itemEmbedding.findMany({
      where: { itemId: { in: items.map((i) => i.id) } },
    });
    const byItem = new Map(existing.map((e) => [e.itemId, e]));
    const vectors = new Map<string, number[]>();
    const missing = items.filter((i) => {
      const e = byItem.get(i.id);
      if (
        e &&
        e.contentHash === i.contentHash &&
        e.model === this.embedder!.model &&
        validVector(e.vector)
      ) {
        vectors.set(i.id, e.vector);
        return false;
      }
      return true;
    });
    if (missing.length) {
      await reserveAiCall(this.prisma, batchId, lease);
      const computed = await this.embedder.embed(missing.map((i) => i.content));
      if (
        !Array.isArray(computed) ||
        computed.length !== missing.length ||
        computed.some((vector) => !validVector(vector))
      )
        throw new ServiceUnavailableException(
          'Dịch vụ embedding trả dữ liệu không hợp lệ; hãy thử lại',
        );
      for (const [idx, item] of missing.entries()) {
        const vector = computed[idx];
        vectors.set(item.id, vector);
        const model = this.embedder.model;
        await this.writeWithLease(lease, (tx) =>
          tx.itemEmbedding.upsert({
            where: { itemId: item.id },
            create: {
              itemId: item.id,
              vector,
              model,
              contentHash: item.contentHash!,
            },
            update: {
              vector,
              model,
              contentHash: item.contentHash!,
            },
          }),
        );
      }
    }
    const others = await this.prisma.itemEmbedding.findMany({
      where: {
        model: this.embedder.model,
        item: {
          batchId: { not: batchId },
          status: { notIn: ['AI_REJECTED', 'REJECTED'] },
        },
      },
      select: { itemId: true, vector: true },
    });
    const dimensions = new Set(
      [...vectors.values()].map((vector) => vector.length),
    );
    if (
      dimensions.size !== 1 ||
      others.some(
        (other) =>
          !validVector(other.vector) || !dimensions.has(other.vector.length),
      )
    )
      throw new ServiceUnavailableException(
        'Dữ liệu embedding không tương thích; hãy kiểm tra cấu hình và thử lại',
      );
    const flags: Array<{
      itemId: string;
      contentHash: string;
      suspectedDuplicateId: string;
    }> = [];
    for (const item of items) {
      const v = vectors.get(item.id);
      if (!v) continue;
      let best: { id: string; score: number } | null = null;
      for (const o of others) {
        const score = cosineSimilarity(v, o.vector);
        if (!best || score > best.score) best = { id: o.itemId, score };
      }
      for (const other of items) {
        if (other.id === item.id) continue;
        const otherVector = vectors.get(other.id);
        if (!otherVector) continue;
        const score = cosineSimilarity(v, otherVector);
        if (!best || score > best.score) best = { id: other.id, score };
      }
      if (best && best.score >= softThreshold)
        flags.push({
          itemId: item.id,
          contentHash: item.contentHash!,
          suspectedDuplicateId: best.id,
        });
    }
    if (flags.length)
      await this.writeWithLease(lease, (tx) =>
        tx.itemCheckResult.createMany({
          data: flags.map((f) => ({
            ...f,
            checkpoint,
            level: 'SOFT',
            reasonCodes: ['DUPLICATE_SEMANTIC_SUSPECT'],
          })),
        }),
      );
    return {
      skipped: false as const,
      checked: items.length,
      flagged: flags.length,
    };
  }
}
