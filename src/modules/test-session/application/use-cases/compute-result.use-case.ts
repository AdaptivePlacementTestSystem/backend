import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaTestSessionRepository } from '../../infrastructure/persistence/prisma-test-session.repository';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { StoppingReason } from '../../domain/entities/test-session.entity';
import { CEFRLevel, CEFRConfidence } from '@prisma/client';
import { randomUUID } from 'crypto';

@Injectable()
export class ComputeResultUseCase {
  constructor(
    private readonly sessionRepository: PrismaTestSessionRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    sessionId: string,
    thetaFinal: number,
    seFinal: number,
    stoppingReason: StoppingReason,
  ): Promise<void> {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên làm bài');
    }

    await this.sessionRepository.complete(sessionId, thetaFinal, seFinal, stoppingReason);

    const cefrLevel = this.mapThetaToCEFR(thetaFinal);
    const cefrConfidence = seFinal < 0.35 ? CEFRConfidence.HIGH : seFinal < 0.5 ? CEFRConfidence.MEDIUM : CEFRConfidence.LOW;
    const boundaryEffect = thetaFinal > 1.5 || thetaFinal < -2.5;

    const ci95Lower = parseFloat((thetaFinal - 1.96 * seFinal).toFixed(4));
    const ci95Upper = parseFloat((thetaFinal + 1.96 * seFinal).toFixed(4));

    await this.prisma.languageProfile.create({
      data: {
        id: randomUUID(),
        studentId: session.studentId,
                testSessionId: session.id,
        completedAt: new Date(),
        theta: thetaFinal,
        standardError: seFinal,
        confidenceInterval95: [ci95Lower, ci95Upper],
        cefrLevel,
        cefrConfidence,
        boundaryEffect,
        skillProfiles: [],
        errorPatterns: [],
        testMetadata: {
          itemsAdministered: session.responses.length,
          algorithm: 'CAT-Rasch-1PL',
          thetaFinal,
          seFinal,
          stoppingReason,
        },
        aiRecommendations: [],
      },
    });
  }

  private mapThetaToCEFR(theta: number): CEFRLevel {
    if (theta < -2.0) return CEFRLevel.PRE_A1;
    if (theta < -1.0) return CEFRLevel.A1;
    if (theta < 0.0) return CEFRLevel.A2;
    if (theta < 1.0) return CEFRLevel.B1;
    if (theta < 2.0) return CEFRLevel.B2;
    return CEFRLevel.C1_PLUS;
  }
}
