import { effectiveStatus } from '../../domain/effective-status';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';

export interface ExamRoundDetailDto {
  id: string;
  title: string;
  opensAt: Date;
  closesAt: Date;
  durationMinutes: number;
  status: string;
  effectiveStatus: string;
  sessionStatus?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  sessionId?: string;
  activeSessionId?: string;
}

@Injectable()
export class GetExamRoundDetailUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    roundId: string,
    userId?: string,
    userRole?: string,
  ): Promise<ExamRoundDetailDto> {
    const round = await this.prisma.examRound.findUnique({
      where: { id: roundId },
      include: {
        sessions: userId
          ? {
              where: { studentId: userId },
              orderBy: { startedAt: 'desc' },
              take: 1,
            }
          : false,
      },
    });

    if (!round) {
      throw new NotFoundException('Không tìm thấy kỳ thi');
    }

    if (userRole === UserRole.STUDENT && userId) {
      const isParticipant = await this.prisma.examRoundParticipant.findUnique({
        where: {
          roundId_studentId: {
            roundId,
            studentId: userId,
          },
        },
      });

      if (!isParticipant) {
        throw new ForbiddenException(
          'Bạn không thuộc danh sách thí sinh của kỳ thi này',
        );
      }
    }

    const now = new Date();
    const latestSession = round.sessions && round.sessions[0];

    return {
      id: round.id,
      title: round.name,
      opensAt: round.opensAt,
      closesAt: round.closesAt,
      durationMinutes: round.durationMinutes,
      status: round.status,
      effectiveStatus: effectiveStatus(round, now),
      sessionStatus: latestSession
        ? (latestSession.status as any)
        : 'NOT_STARTED',
      sessionId: latestSession?.id,
      activeSessionId:
        latestSession?.status === 'IN_PROGRESS' ? latestSession.id : undefined,
    };
  }
}
