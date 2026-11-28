import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { effectiveStatus } from '../../domain/effective-status';

@Injectable()
export class ListExamRoundsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    const rounds = await this.prisma.examRound.findMany({
      orderBy: { opensAt: 'desc' },
      select: {
        id: true,
        name: true,
        status: true,
        opensAt: true,
        closesAt: true,
        durationMinutes: true,
        createdAt: true,
        _count: {
          select: { participants: true, sessions: true },
        },
      },
    });

    const now = new Date();
    return rounds.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      effectiveStatus: effectiveStatus(r, now),
      opensAt: r.opensAt,
      closesAt: r.closesAt,
      durationMinutes: r.durationMinutes,
      participantCount: r._count.participants,
      sessionCount: r._count.sessions,
    }));
  }
}
