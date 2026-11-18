import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

export interface StudentExamHistoryRowDto {
  sessionId: string;
  examRoundId: string;
  examRoundTitle: string;
  startedAt: Date;
  completedAt: Date | null;
  itemsAdministered: number;
  cefrLevel: string | null;
  theta: number | null;
  standardError: number | null;
  status: string;
  stoppingReason: string | null;
}

@Injectable()
export class GetStudentHistoryUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(studentId: string): Promise<StudentExamHistoryRowDto[]> {
    const sessions = await this.prisma.testSession.findMany({
      where: { studentId },
      include: {
        round: true,
        languageProfile: true,
        responses: {
          select: { id: true },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    return sessions.map((s) => ({
      sessionId: s.id,
      examRoundId: s.examRoundId,
      examRoundTitle: s.round?.name ?? 'Kỳ thi phân lớp tiếng Anh',
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      itemsAdministered: s.responses.length,
      cefrLevel: s.languageProfile?.cefrLevel ?? null,
      theta: s.thetaFinal,
      standardError: s.seFinal,
      status: s.status,
      stoppingReason: s.stoppingReason,
    }));
  }
}
