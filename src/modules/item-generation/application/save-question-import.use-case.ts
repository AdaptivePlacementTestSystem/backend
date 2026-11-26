import { BadRequestException, Injectable } from '@nestjs/common';
import { CEFRLevel, Prisma, Skill } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { validateCandidate } from '../domain/candidate-validation';
import { RunBatchChecksUseCase } from './run-batch-checks.use-case';
import type { ImportedCandidate } from './parse-question-spreadsheet.use-case';
@Injectable()
export class SaveQuestionImportUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runChecks: RunBatchChecksUseCase,
  ) {}
  async execute(
    adminId: string,
    body: { name?: string; rows: ImportedCandidate[] },
  ) {
    if (
      !body ||
      !Array.isArray(body.rows) ||
      !body.rows.length ||
      body.rows.length > 1000 ||
      (body.name !== undefined &&
        (typeof body.name !== 'string' || body.name.length > 100))
    )
      throw new BadRequestException('Danh sách câu hoặc tên lô không hợp lệ');
    const hashes = new Set<string>();
    for (const item of body.rows) {
      if (
        validateCandidate(item).length ||
        typeof item.irtB !== 'number' ||
        !Number.isFinite(item.irtB) ||
        item.irtB < -4 ||
        item.irtB > 4
      )
        throw new BadRequestException('Danh sách chứa câu không hợp lệ');
      const hash = createHash('sha256')
        .update(
          item.content
            .normalize('NFKC')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase(),
        )
        .digest('hex');
      if (hashes.has(hash))
        throw new BadRequestException('Danh sách có câu trùng');
      hashes.add(hash);
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.itemBatch.create({
        data: {
          source: 'IMPORTED',
          createdById: adminId,
          name: body.name?.trim() || null,
          status: 'CHECKING',
        },
      });
      const prepared = body.rows.map((item) => ({
        item,
        id: randomUUID(),
        hash: createHash('sha256')
          .update(
            item.content
              .normalize('NFKC')
              .trim()
              .replace(/\s+/g, ' ')
              .toLowerCase(),
          )
          .digest('hex'),
      }));
      await tx.item.createMany({
        data: prepared.map(({ item, id, hash }) => ({
          id,
          batchId: batch.id,
          content: item.content.trim(),
          options: item.options as Prisma.InputJsonObject,
          correctAnswer: item.correctAnswer,
          skill: item.skill as Skill,
          cefrTarget: item.cefrTarget as CEFRLevel,
          topicTag: item.topicTag?.trim() || null,
          irtB: item.irtB,
          contentHash: hash,
          status: 'DRAFT',
        })),
      });
      await tx.explanation.createMany({
        data: prepared.map(({ item, id }) => ({
          itemId: id,
          content: item.explanation.trim(),
        })),
      });
      return { batchId: batch.id, status: 'CHECKING', count: body.rows.length };
    });
    const checked = await this.runChecks.execute(result.batchId, 'C2');
    return {
      ...result,
      status: checked.status,
      exactDuplicates: checked.exactRejected,
      nearDuplicates: checked.nearRejected,
      nearFlagged: checked.nearFlagged,
      semanticFlagged: checked.semanticFlagged,
    };
  }
}
