import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  ClassReportEntity,
  CEFRDistribution,
} from '../../domain/entities/class-report.entity';

@Injectable()
export class GenerateClassReportUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(examRoundId?: string): Promise<ClassReportEntity> {
    const where: any = {};
    if (examRoundId) {
      where.testSession = { examRoundId };
    }

    const profiles = await this.prisma.languageProfile.findMany({
      where,
      select: {
        cefrLevel: true,
        theta: true,
      },
    });

    const initialDistribution: CEFRDistribution = {
      PRE_A1: 0,
      A1: 0,
      A2: 0,
      B1: 0,
      B2: 0,
      C1_PLUS: 0,
    };

    let totalTheta = 0;
    for (const p of profiles) {
      initialDistribution[p.cefrLevel] =
        (initialDistribution[p.cefrLevel] || 0) + 1;
      totalTheta += p.theta;
    }

    const totalStudents = profiles.length;
    const averageTheta =
      totalStudents > 0
        ? parseFloat((totalTheta / totalStudents).toFixed(4))
        : 0;

    return new ClassReportEntity(
      examRoundId ?? null,
      totalStudents,
      initialDistribution,
      averageTheta,
    );
  }
}
