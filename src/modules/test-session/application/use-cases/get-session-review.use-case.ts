import { ErrorCode } from '@apt/shared-types';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { SessionStatus } from '../../domain/entities/test-session.entity';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';

export interface ReviewEntryDto {
  questionNumber: number;
  itemId: string;
  content: string;
  options: Record<string, string>;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  skill: string;
  cefrTarget: string;
  irtB: number;
  explanation: string | null;
}

@Injectable()
export class GetSessionReviewUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async execute(
    sessionId: string,
    userId: string,
    userRole: string,
  ): Promise<ReviewEntryDto[]> {
    // Quyết định #78 & K6: Kiểm tra công tắc REVIEW_ENABLED
    const reviewEnabled =
      this.configService.get<boolean>('reviewEnabled') ?? true;
    if (!reviewEnabled) {
      throw new ForbiddenException({
        code: ErrorCode.REVIEW_DISABLED,
        message:
          'Tính năng xem lại kết quả bài thi đang tạm khóa trên hệ thống.',
      });
    }

    const session = await this.prisma.testSession.findUnique({
      where: { id: sessionId },
      include: {
        responses: {
          orderBy: { answeredAt: 'asc' },
          include: {
            item: {
              include: {
                explanation: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên làm bài');
    }

    if (userRole === UserRole.STUDENT && session.studentId !== userId) {
      throw new ForbiddenException(
        'Bạn không có quyền xem lại kết quả bài thi này',
      );
    }

    if (session.status !== SessionStatus.COMPLETED) {
      throw new BadRequestException(
        'Chỉ có thể xem lại bài thi sau khi đã hoàn thành',
      );
    }

    return session.responses.map((r, index) => {
      const item = r.item;
      return {
        questionNumber: index + 1,
        itemId: item.id,
        content: item.content,
        options: item.options as Record<string, string>,
        selectedAnswer: r.response,
        correctAnswer: item.correctAnswer,
        isCorrect: r.isCorrect,
        skill: item.skill,
        cefrTarget: item.cefrTarget,
        irtB: item.irtB,
        explanation: item.explanation?.content ?? null,
      };
    });
  }
}
