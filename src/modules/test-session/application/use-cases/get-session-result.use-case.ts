import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
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
  boundaryEffect: boolean;
  confidenceInterval95: number[];
  totalItems: number;
  startedAt: Date;
  completedAt: Date | null;
  durationSeconds: number;
  stoppingReason: string | null;
  skillProfiles: any[];
  errorPatterns: any[];
  aiRecommendations: string[];
}

@Injectable()
export class GetSessionResultUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    sessionId: string,
    userId: string,
    userRole: string,
  ): Promise<SessionResultDto> {
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
      throw new ForbiddenException(
        'Bạn không có quyền truy cập kết quả bài thi này',
      );
    }

    if (session.status !== SessionStatus.COMPLETED) {
      throw new BadRequestException('Phiên làm bài chưa hoàn thành');
    }

    const profile = await this.prisma.languageProfile.findUnique({
      where: { testSessionId: sessionId },
    });

    if (!profile) {
      throw new NotFoundException(
        'Không tìm thấy hồ sơ năng lực (LanguageProfile) của phiên thi này',
      );
    }

    const durationSeconds = session.completedAt
      ? Math.round(
          (session.completedAt.getTime() - session.startedAt.getTime()) / 1000,
        )
      : 0;

    const thetaFinal = session.thetaFinal ?? profile.theta ?? 0;
    const seFinal = session.seFinal ?? profile.standardError ?? 0.35;
    const ci95Lower = parseFloat((thetaFinal - 1.96 * seFinal).toFixed(4));
    const ci95Upper = parseFloat((thetaFinal + 1.96 * seFinal).toFixed(4));

    const rawSkillProfiles = Array.isArray(profile.skillProfiles)
      ? (profile.skillProfiles as any[])
      : [];
    const skillProfiles = rawSkillProfiles.map((s) => ({
      skill: s.skill ?? 'VOCABULARY',
      itemsAdministered:
        s.itemsAdministered ?? s.questionsCount ?? s.total ?? 0,
      correctCount: s.correctCount ?? 0,
      scorePercent: s.scorePercent,
      accuracyRate: s.accuracyRate,
    }));

    const rawErrorPatterns = Array.isArray(profile.errorPatterns)
      ? (profile.errorPatterns as any[])
      : [];
    const errorPatterns = rawErrorPatterns.map((e, index) => {
      const topicTag = e.topicTag ?? e.topic ?? `Chủ điểm ${index + 1}`;
      const skill = e.skill ?? 'GRAMMAR';
      const itemsAttempted =
        typeof e.itemsAttempted === 'number'
          ? e.itemsAttempted
          : typeof e.total === 'number'
            ? e.total
            : typeof e.count === 'number'
              ? e.count + (e.correctCount ?? 0)
              : 1;
      const correctCount =
        typeof e.correctCount === 'number' ? e.correctCount : 0;
      const accuracyRate =
        typeof e.accuracyRate === 'number'
          ? e.accuracyRate
          : itemsAttempted > 0
            ? parseFloat((correctCount / itemsAttempted).toFixed(2))
            : 0;
      const severity =
        e.severity ??
        (accuracyRate < 0.4 ? 'HIGH' : accuracyRate < 0.7 ? 'MEDIUM' : 'LOW');

      return {
        topicTag,
        skill,
        itemsAttempted,
        correctCount,
        accuracyRate,
        severity,
      };
    });

    return {
      sessionId: session.id,
      status: session.status,
      thetaFinal: session.thetaFinal,
      seFinal: session.seFinal,
      cefrLevel: profile.cefrLevel,
      confidenceLevel: profile.cefrConfidence,
      boundaryEffect: profile.boundaryEffect,
      confidenceInterval95: profile.confidenceInterval95 ?? [
        ci95Lower,
        ci95Upper,
      ],
      totalItems: session.responses.length,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      durationSeconds,
      stoppingReason: session.stoppingReason,
      skillProfiles,
      errorPatterns,
      aiRecommendations: (profile.aiRecommendations as string[]) ?? [],
    };
  }
}
