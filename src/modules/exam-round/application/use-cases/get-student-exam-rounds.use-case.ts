import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

export interface StudentExamRoundDto {
  id: string;
  title: string;
  opensAt: Date;
  closesAt: Date;
  durationMinutes: number;
  status: string;
  effectiveStatus: string;
  sessionStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  sessionId?: string;
  scoreCefr?: string | null;
}

@Injectable()
export class GetStudentExamRoundsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(studentId: string): Promise<StudentExamRoundDto[]> {
    const participants = await this.prisma.examRoundParticipant.findMany({
      where: { studentId },
      include: {
        round: true,
        sessions: {
          where: { studentId },
          include: {
            languageProfile: true,
          },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { addedAt: 'desc' },
    });

    const now = new Date();

    return participants.map((p) => {
      const round = p.round;
      const latestSession = p.sessions[0];

      let effectiveStatus = round.status as string;
      if (round.status === 'SCHEDULED' || round.status === 'OPEN') {
        if (now < round.opensAt) {
          effectiveStatus = 'SCHEDULED';
        } else if (now > round.closesAt) {
          effectiveStatus = 'CLOSED';
        } else {
          effectiveStatus = 'OPEN';
        }
      }

      let sessionStatus:
        'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED' =
        'NOT_STARTED';
      if (latestSession) {
        sessionStatus = latestSession.status as any;
      }

      return {
        id: round.id,
        title: round.name,
        opensAt: round.opensAt,
        closesAt: round.closesAt,
        durationMinutes: round.durationMinutes,
        status: round.status,
        effectiveStatus,
        sessionStatus,
        sessionId: latestSession?.id,
        scoreCefr: latestSession?.languageProfile?.cefrLevel ?? null,
      };
    });
  }
}
