import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { SessionStatus } from '../../domain/entities/test-session.entity';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';

export interface SessionResultDto {
  sessionId: string;
  status: string;
  thetaFinal: number | null;
  seFinal: number | null;
  cefrLevel: string;
  confidenceLevel: string;
  totalItems: number;
  startedAt: Date;
  completedAt: Date | null;
  durationSeconds: number;
  stoppingReason: string | null;
}

@Injectable()
export class GetSessionResultUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(sessionId: string, userId: string, userRole: string): Promise<SessionResultDto> {
    const session = await this.prisma.testSession.findUnique({
      where: { id: sessionId },
      include: {
        responses: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên làm bài');
    }

    if (userRole === UserRole.STUDENT && session.studentId !== userId) {
      throw new ForbiddenException('Bạn không có quyền truy cập kết quả bài thi này');
    }

    if (session.status !== SessionStatus.COMPLETED) {
      throw new BadRequestException('Phiên làm bài chưa hoàn thành');
    }

    const profile = await this.prisma.languageProfile.findUnique({
      where: { testSessionId: sessionId },
    });

    const durationSeconds = session.completedAt
      ? Math.round((session.completedAt.getTime() - session.startedAt.getTime()) / 1000)
      : 0;

    return {
      sessionId: session.id,
      status: session.status,
      thetaFinal: session.thetaFinal,
      seFinal: session.seFinal,
      cefrLevel: profile?.cefrLevel ?? 'B1',
      confidenceLevel: profile?.cefrConfidence ?? 'HIGH',
      totalItems: session.responses.length,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      durationSeconds,
      stoppingReason: session.stoppingReason,
    };
  }
}
