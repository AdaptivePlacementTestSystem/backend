import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { EditItemDto, ReviewItemDetailDto, OptionMap } from '../../dto/teacher-review.dto';
import { ItemStatus } from '@apt/shared-types';

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

    // 1. Kiểm tra luật cứng nếu có cập nhật
    if (dto.options) {
      const { A, B, C, D } = dto.options;
      if (!A?.trim() || !B?.trim() || !C?.trim() || !D?.trim()) {
        throw new BadRequestException('Bốn phương án A, B, C, D không được để trống');
      }
      const uniqueOptions = new Set([A.trim(), B.trim(), C.trim(), D.trim()]);
      if (uniqueOptions.size < 4) {
        throw new BadRequestException('Bốn phương án trả lời phải khác nhau');
      }
    }

    if (dto.correctAnswer) {
      const validAnswers = ['A', 'B', 'C', 'D'];
      if (!validAnswers.includes(dto.correctAnswer.toUpperCase())) {
        throw new BadRequestException('Đáp án đúng phải là một trong các giá trị A, B, C, D');
      }
    }

    if (dto.content && !dto.content.trim()) {
      throw new BadRequestException('Nội dung câu hỏi không được để trống');
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

    // 3. Cập nhật vào cơ sở dữ liệu trong 1 Transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      // Cập nhật câu hỏi
      const updatedItem = await tx.item.update({
        where: { id: itemId },
        data: {
          content: dto.content?.trim() || item.content,
          options: dto.options ? (dto.options as any) : item.options,
          correctAnswer: dto.correctAnswer ? dto.correctAnswer.toUpperCase() : item.correctAnswer,
          firstReview: updatedFirstReview,
        },
      });

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

      return updatedItem;
    });

    const refreshedExplanation = await this.prisma.explanation.findUnique({
      where: { itemId },
    });

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
