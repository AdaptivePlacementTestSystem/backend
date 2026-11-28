import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { contentFingerprint } from '../domain/content-fingerprint';
import { validateCandidate } from '../domain/candidate-validation';
import { readT2Thresholds } from '../domain/duplicate-config';

type Decision = 'APPROVE' | 'REJECT' | 'CONFIRM' | 'REMOVE';

@Injectable()
export class TeacherReviewUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async edit(
    userId: string,
    itemId: string,
    input: {
      content: string;
      options: Record<string, string>;
      correctAnswer: string;
      explanation: string;
    },
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const item = await tx.item.findUnique({
          where: { id: itemId },
          include: {
            explanation: true,
            batch: { select: { status: true, source: true } },
          },
        });
        if (!item) throw new NotFoundException('Không tìm thấy câu hỏi');
        if (item.reviewerId !== userId)
          throw new ForbiddenException('Câu hỏi không thuộc phân công');
        if (item.status !== 'DRAFT' || item.batch.status !== 'IN_REVIEW')
          throw new ConflictException('Câu hỏi không còn chờ duyệt');
        const errors = validateCandidate({
          ...input,
          skill: item.skill,
          cefrTarget: item.cefrTarget,
          topicTag: item.topicTag,
        });
        if (errors.length)
          throw new BadRequestException(
            `Nội dung không hợp lệ: ${errors.join(', ')}`,
          );
        const content = input.content.trim();
        const hash = contentFingerprint(input);
        const exact = await tx.item.findFirst({
          where: {
            id: { not: itemId },
            contentHash: hash,
            status: { notIn: ['REJECTED', 'AI_REJECTED'] },
          },
          select: { id: true },
        });
        if (exact)
          throw new BadRequestException('Câu hỏi trùng nội dung với câu khác');
        const near = await tx.$queryRaw<
          Array<{ id: string; score: number }>
        >`SELECT id::text AS id, similarity(content, ${content})::float8 AS score FROM items WHERE id <> ${itemId}::uuid AND status NOT IN ('REJECTED', 'AI_REJECTED') ORDER BY score DESC LIMIT 1`;
        if (near[0] && Number(near[0].score) >= readT2Thresholds().hard)
          throw new BadRequestException('Câu hỏi quá giống câu khác');
        const first =
          item.firstReview &&
          typeof item.firstReview === 'object' &&
          !Array.isArray(item.firstReview)
            ? item.firstReview
            : {};
        const snapshot = first.originalSnapshot ?? {
          content: item.content,
          options: item.options,
          correctAnswer: item.correctAnswer,
          explanation: item.explanation?.content ?? '',
        };
        const changed = await tx.item.updateMany({
          where: {
            id: itemId,
            reviewerId: userId,
            status: 'DRAFT',
            batch: { status: 'IN_REVIEW' },
          },
          data: {
            content,
            options: input.options,
            correctAnswer: input.correctAnswer,
            contentHash: hash,
            firstReview: {
              ...first,
              originalSnapshot: snapshot,
            } as Prisma.InputJsonObject,
          },
        });
        if (!changed.count)
          throw new ConflictException('Câu hỏi đã được xử lý');
        await tx.explanation.upsert({
          where: { itemId },
          update: { content: input.explanation.trim() },
          create: { itemId, content: input.explanation.trim() },
        });
        if (near[0] && Number(near[0].score) >= readT2Thresholds().soft) {
          await tx.itemCheckResult.create({
            data: {
              itemId,
              contentHash: hash,
              checkpoint: item.batch.source === 'IMPORTED' ? 'C2' : 'C1',
              level: 'SOFT',
              reasonCodes: ['DUPLICATE_NEAR_SUSPECT'],
              suspectedDuplicateId: near[0].id,
            },
          });
        }
        return { id: itemId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async list(userId: string) {
    const items = await this.prisma.item.findMany({
      where: {
        OR: [
          { reviewerId: userId, status: 'DRAFT' },
          { batch: { is: { confirmerId: userId } }, status: 'FIRST_APPROVED' },
        ],
        batch: { status: 'IN_REVIEW' },
      },
      include: {
        explanation: true,
        checkResults: {
          where: { level: 'SOFT' },
          select: { reasonCodes: true, contentHash: true },
        },
        batch: { select: { name: true, confirmerId: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return items.map((i) => ({
      id: i.id,
      batchId: i.batchId,
      batchName: i.batch.name,
      content: i.content,
      options: i.options,
      correctAnswer: i.correctAnswer,
      explanation: i.explanation?.content ?? null,
      flags: i.checkResults.filter(
        (check) => check.contentHash === i.contentHash,
      ),
      role: i.reviewerId === userId ? 'A' : 'B',
      firstReview: i.firstReview,
      secondReview: i.secondReview,
    }));
  }

  async decide(
    userId: string,
    itemId: string,
    action: Decision,
    comment?: string,
  ) {
    if (!['APPROVE', 'REJECT', 'CONFIRM', 'REMOVE'].includes(action))
      throw new BadRequestException('Quyết định không hợp lệ');
    if (comment != null && typeof comment !== 'string')
      throw new BadRequestException('Comment phải là chuỗi');
    if ((action === 'REJECT' || action === 'REMOVE') && !comment?.trim())
      throw new BadRequestException('Bắt buộc nhập comment khi loại câu hỏi');
    const roleA = action === 'APPROVE' || action === 'REJECT';
    return this.prisma.$transaction(
      async (tx) => {
        const item = await tx.item.findUnique({
          where: { id: itemId },
          include: { batch: { select: { status: true, confirmerId: true } } },
        });
        if (!item) throw new NotFoundException('Không tìm thấy câu hỏi');
        if ((roleA ? item.reviewerId : item.batch.confirmerId) !== userId)
          throw new ForbiddenException('Câu hỏi không thuộc phân công');
        if (
          item.batch.status !== 'IN_REVIEW' ||
          item.status !== (roleA ? 'DRAFT' : 'FIRST_APPROVED')
        )
          throw new ConflictException('Câu hỏi không còn chờ xử lý');
        const status =
          action === 'APPROVE'
            ? 'FIRST_APPROVED'
            : action === 'CONFIRM'
              ? 'SECOND_APPROVED'
              : 'REJECTED';
        const previous = roleA ? item.firstReview : item.secondReview;
        const detail = {
          ...(previous &&
          typeof previous === 'object' &&
          !Array.isArray(previous)
            ? previous
            : {}),
          action,
          [roleA ? 'reviewedAt' : 'confirmedAt']: new Date().toISOString(),
        };
        const changed = await tx.item.updateMany({
          where: {
            id: itemId,
            status: roleA ? 'DRAFT' : 'FIRST_APPROVED',
            ...(roleA ? { reviewerId: userId } : {}),
            batch: {
              is: {
                status: 'IN_REVIEW',
                ...(roleA ? {} : { confirmerId: userId }),
              },
            },
          },
          data: {
            status,
            ...(roleA
              ? {
                  firstReview: {
                    ...detail,
                    ...(comment?.trim() ? { comment: comment.trim() } : {}),
                  },
                }
              : {
                  secondReview: {
                    ...detail,
                    ...(comment?.trim() ? { comment: comment.trim() } : {}),
                  },
                }),
          },
        });
        if (changed.count !== 1)
          throw new ConflictException('Câu hỏi đã được xử lý');
        await tx.itemReviewEvent.create({
          data: { batchId: item.batchId, itemId, actorId: userId, action },
        });
        const open = await tx.item.count({
          where: {
            batchId: item.batchId,
            status: { in: ['DRAFT', 'FIRST_APPROVED'] },
          },
        });
        if (!open) {
          const approved = await tx.item.count({
            where: { batchId: item.batchId, status: 'SECOND_APPROVED' },
          });
          await tx.itemBatch.updateMany({
            where: { id: item.batchId, status: 'IN_REVIEW' },
            data: { status: approved ? 'READY_TO_FINALIZE' : 'DONE' },
          });
        }
        return { id: itemId, status };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async confirmAll(userId: string, batchId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.itemBatch.findUnique({
          where: { id: batchId },
          select: { status: true },
        });
        if (!batch) throw new NotFoundException('Không tìm thấy lô');
        if (batch.status !== 'IN_REVIEW')
          throw new ConflictException('Lô không còn chờ duyệt');
        const assigned = await tx.item.findMany({
          where: {
            batchId,
            batch: { is: { confirmerId: userId, status: 'IN_REVIEW' } },
            status: 'FIRST_APPROVED',
          },
          select: { id: true, secondReview: true },
        });
        if (!assigned.length)
          throw new ConflictException(
            'Không có câu sẵn sàng xác nhận trong lô',
          );
        const confirmedAt = new Date().toISOString();
        for (const item of assigned) {
          const previous =
            item.secondReview &&
            typeof item.secondReview === 'object' &&
            !Array.isArray(item.secondReview)
              ? item.secondReview
              : {};
          const changed = await tx.item.updateMany({
            where: {
              id: item.id,
              batchId,
              batch: { is: { confirmerId: userId, status: 'IN_REVIEW' } },
              status: 'FIRST_APPROVED',
            },
            data: {
              status: 'SECOND_APPROVED',
              secondReview: { ...previous, action: 'CONFIRM', confirmedAt },
            },
          });
          if (changed.count !== 1)
            throw new ConflictException('Danh sách câu đã thay đổi');
        }
        await tx.itemReviewEvent.create({
          data: {
            batchId,
            itemId: null,
            actorId: userId,
            action: 'CONFIRM_ALL',
            details: {
              updatedCount: assigned.length,
              itemIds: assigned.map((entry) => entry.id),
            },
          },
        });
        const open = await tx.item.count({
          where: { batchId, status: { in: ['DRAFT', 'FIRST_APPROVED'] } },
        });
        if (!open)
          await tx.itemBatch.updateMany({
            where: { id: batchId, status: 'IN_REVIEW' },
            data: { status: 'READY_TO_FINALIZE' },
          });
        return { confirmed: assigned.length };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
