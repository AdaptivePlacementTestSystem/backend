import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { CEFRLevel, Prisma, Skill } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { contentFingerprint } from '../domain/content-fingerprint';
import { validateCandidate } from '../domain/candidate-validation';
import type { ImportedCandidate } from './parse-question-spreadsheet.use-case';

const MAX_BATCH_ROWS = 50;
type SavedBatch = { batchId: string; status: string; count: number };
function response(batches: SavedBatch[]) {
  return {
    ...batches[0],
    batches,
    batchIds: batches.map((batch) => batch.batchId),
    count: batches.reduce((sum, batch) => sum + batch.count, 0),
  };
}

@Injectable()
export class SaveQuestionImportUseCase {
  constructor(private readonly prisma: PrismaService) {}
  async execute(
    adminId: string,
    body: { name?: string; rows: ImportedCandidate[]; operationId: string },
  ) {
    const existing = await this.findExisting(adminId, body.operationId);
    if (existing) return existing;
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
      const hash = contentFingerprint(item);
      if (hashes.has(hash))
        throw new BadRequestException('Danh sách có câu trùng');
      hashes.add(hash);
    }
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const count = Math.ceil(body.rows.length / MAX_BATCH_ROWS);
          const saved: SavedBatch[] = [];
          for (let part = 0; part < count; part++) {
            const rows = body.rows.slice(
              part * MAX_BATCH_ROWS,
              (part + 1) * MAX_BATCH_ROWS,
            );
            const suffix = count > 1 ? ` (${part + 1}/${count})` : '';
            const baseName = body.name?.trim() || (count > 1 ? 'Lô nhập' : '');
            const name = baseName
              ? `${baseName.slice(0, 100 - suffix.length)}${suffix}`
              : null;
            const batch = await tx.itemBatch.create({
              data: {
                source: 'IMPORTED',
                createdById: adminId,
                name,
                status: 'CHECKING',
                importOperationId: part === 0 ? body.operationId : null,
                importGroupId: body.operationId,
                importPart: part + 1,
              },
            });
            const prepared = rows.map((item) => ({
              item,
              id: randomUUID(),
              hash: contentFingerprint(item),
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
            await tx.itemBatchJob.create({
              data: { batchId: batch.id, kind: 'CHECK' },
            });
            saved.push({
              batchId: batch.id,
              status: 'CHECKING',
              count: rows.length,
            });
          }
          return response(saved);
        },
        { timeout: 30000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const prior = await this.findExisting(adminId, body.operationId);
        if (prior) return prior;
      }
      throw error;
    }
  }

  async findExisting(adminId: string, operationId: string) {
    const select = {
      id: true,
      createdById: true,
      source: true,
      status: true,
      _count: { select: { items: true } },
    } as const;
    let existing = await this.prisma.itemBatch.findMany({
      where: { importGroupId: operationId },
      select,
      orderBy: { importPart: 'asc' },
    });
    if (!existing.length) {
      const legacy = await this.prisma.itemBatch.findUnique({
        where: { importOperationId: operationId },
        select,
      });
      existing = legacy ? [legacy] : [];
    }
    if (!existing.length) return null;
    if (
      existing.some(
        (batch) => batch.createdById !== adminId || batch.source !== 'IMPORTED',
      )
    )
      throw new ConflictException('Mã thao tác không hợp lệ');
    return response(
      existing.map((batch) => ({
        batchId: batch.id,
        status: batch.status,
        count: batch._count.items,
      })),
    );
  }
}
