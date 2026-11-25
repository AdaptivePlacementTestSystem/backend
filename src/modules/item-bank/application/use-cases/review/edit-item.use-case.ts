import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { EditItemDto, ReviewItemDetailDto, OptionMap } from '../../dto/teacher-review.dto';
import { ItemStatus, ErrorCode } from '@apt/shared-types';
import * as crypto from 'crypto';

export function computeItemContentHash(
  content: string,
  options?: OptionMap,
  explanation?: string,
): string {
  const normContent = (content || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const optStr = options
    ? ['A', 'B', 'C', 'D']
        .map((k) => `${k}:${(options[k as keyof OptionMap] || '').trim().toLowerCase()}`)
        .join('|')
    : '';
  const normExp = (explanation || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto
    .createHash('sha256')
    .update(`${normContent}###${optStr}###${normExp}`)
    .digest('hex');
}

@Injectable()
export class EditItemUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(teacherId: string, itemId: string, dto: EditItemDto): Promise<ReviewItemDetailDto> {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      include: {
        explanation: true,
        checkResults: true,
      },
    });

    if (!item) {
      throw new NotFoundException(`Không tìm thấy câu hỏi: ${itemId}`);
    }

    if (item.reviewerId !== teacherId) {
      throw new ForbiddenException('Bạn không được phân công duyệt câu hỏi này (NOT_ASSIGNED)');
    }

    if (item.status !== ItemStatus.DRAFT) {
      throw new BadRequestException('Chỉ có thể chỉnh sửa câu hỏi khi đang ở trạng thái DRAFT');
    }

    // 1. Kiểm tra luật cứng nếu có cập nhật (BR-27: hỏng => 422 INVALID_AFTER_EDIT)
    if (dto.options) {
      const { A, B, C, D } = dto.options;
      if (!A?.trim() || !B?.trim() || !C?.trim() || !D?.trim()) {
        throw new UnprocessableEntityException({
          code: ErrorCode.INVALID_AFTER_EDIT,
          message: 'Bốn phương án A, B, C, D không được để trống',
        });
      }
      const uniqueOptions = new Set([A.trim(), B.trim(), C.trim(), D.trim()]);
      if (uniqueOptions.size < 4) {
        throw new UnprocessableEntityException({
          code: ErrorCode.INVALID_AFTER_EDIT,
          message: 'Bốn phương án trả lời phải khác nhau',
        });
      }
    }

    if (dto.correctAnswer) {
      const validAnswers = ['A', 'B', 'C', 'D'];
      if (!validAnswers.includes(dto.correctAnswer.toUpperCase())) {
        throw new UnprocessableEntityException({
          code: ErrorCode.INVALID_AFTER_EDIT,
          message: 'Đáp án đúng phải là một trong các giá trị A, B, C, D',
        });
      }
    }

    if (dto.content !== undefined && !dto.content.trim()) {
      throw new UnprocessableEntityException({
        code: ErrorCode.INVALID_AFTER_EDIT,
        message: 'Nội dung câu hỏi không được để trống',
      });
    }

    const finalContent = dto.content?.trim() || item.content;
    const finalOptions = dto.options
      ? (dto.options as OptionMap)
      : (item.options as unknown as OptionMap);
    const finalExplanation =
      dto.explanation !== undefined
        ? dto.explanation.trim()
        : item.explanation?.content || '';
    const newContentHash = computeItemContentHash(
      finalContent,
      finalOptions,
      finalExplanation,
    );

    // T1 duplicate check (BR-27): kiểm tra trùng hash với các câu khác không bị loại
    const duplicate = await this.prisma.item.findFirst({
      where: {
        id: { not: itemId },
        contentHash: newContentHash,
        status: { notIn: [ItemStatus.REJECTED, ItemStatus.AI_REJECTED] },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new UnprocessableEntityException({
        code: ErrorCode.DUPLICATE_AFTER_EDIT,
        message: 'Nội dung câu hỏi sau khi chỉnh sửa bị trùng lặp với câu hỏi khác trong hệ thống.',
      });
    }

    // 2. Chụp Snapshot bản gốc (GHI MỘT LẦN DUY NHẤT trước khi sửa lần đầu)
    const firstReview = (item.firstReview as Record<string, any>) || {};
    let originalSnapshot = firstReview.originalSnapshot || null;

    if (!originalSnapshot) {
      originalSnapshot = {
        content: item.content,
        options: item.options as unknown as OptionMap,
        correctAnswer: item.correctAnswer,
        explanation: item.explanation?.content || '',
      };
    }

    const updatedFirstReview: Record<string, any> = {
      ...firstReview,
      originalSnapshot,
    };

    // 3. Cập nhật vào cơ sở dữ liệu trong 1 Transaction có điều kiện nguyên tử
    await this.prisma.$transaction(async (tx) => {
      // Cập nhật câu hỏi có kiểm tra người được giao và trạng thái
      const updateResult = await tx.item.updateMany({
        where: {
          id: itemId,
          reviewerId: teacherId,
          status: ItemStatus.DRAFT,
        },
        data: {
          content: finalContent,
          options: finalOptions as any,
          correctAnswer: dto.correctAnswer ? dto.correctAnswer.toUpperCase() : item.correctAnswer,
          contentHash: newContentHash,
          firstReview: updatedFirstReview,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: 'Không thể chỉnh sửa do câu hỏi đã đổi trạng thái hoặc bạn không còn được phân công.',
        });
      }

      // Cập nhật lời giải thích nếu có
      if (dto.explanation !== undefined) {
        if (item.explanation) {
          await tx.explanation.update({
            where: { itemId },
            data: { content: dto.explanation.trim() },
          });
        } else if (dto.explanation.trim()) {
          await tx.explanation.create({
            data: {
              itemId,
              content: dto.explanation.trim(),
            },
          });
        }
      }
    });

    const [updated, refreshedExplanation] = await Promise.all([
      this.prisma.item.findUniqueOrThrow({ where: { id: itemId } }),
      this.prisma.explanation.findUnique({ where: { itemId } }),
    ]);

    return {
      id: updated.id,
      content: updated.content,
      options: updated.options as unknown as OptionMap,
      correctAnswer: updated.correctAnswer,
      skill: updated.skill,
      cefrTarget: updated.cefrTarget,
      topicTag: updated.topicTag,
      irtB: updated.irtB,
      status: updated.status,
      explanation: refreshedExplanation?.content || '',
      firstReview: {
        dueAt: updatedFirstReview.dueAt,
        action: updatedFirstReview.action || null,
        reviewedAt: updatedFirstReview.reviewedAt || null,
        comment: updatedFirstReview.comment || null,
        originalSnapshot,
      },
      hasEdited: true,
      flags: item.checkResults.map((cr) => ({
        level: cr.level,
        reasonCodes: cr.reasonCodes,
        suspectedDuplicateId: cr.suspectedDuplicateId,
      })),
    };
  }
}
