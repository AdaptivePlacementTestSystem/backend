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
    const session = await this.prisma.testSession.findUnique({
      where: { id: sessionId },
      include: {
        responses: {
          include: {
            item: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên làm bài');
    }

    await this.sessionRepository.complete(
      sessionId,
      thetaFinal,
      seFinal,
      stoppingReason,
    );

    const cefrLevel = this.mapThetaToCEFR(thetaFinal);
    const cefrConfidence =
      seFinal < 0.35
        ? CEFRConfidence.HIGH
        : seFinal < 0.5
          ? CEFRConfidence.MEDIUM
          : CEFRConfidence.LOW;
    const boundaryEffect = thetaFinal > 1.5 || thetaFinal < -2.5;

    const ci95Lower = parseFloat((thetaFinal - 1.96 * seFinal).toFixed(4));
    const ci95Upper = parseFloat((thetaFinal + 1.96 * seFinal).toFixed(4));

    // Thống kê theo kỹ năng: Vocabulary & Grammar
    let vocabTotal = 0;
    let vocabCorrect = 0;
    let grammarTotal = 0;
    let grammarCorrect = 0;
    const topicStats: Record<
      string,
      { topicTag: string; skill: string; total: number; correct: number }
    > = {};

    for (const r of session.responses) {
      const skill = r.item?.skill;
      const topicTag = r.item?.topicTag ?? 'Chung';
      const isCorrect = r.isCorrect;

      if (skill === 'VOCABULARY') {
        vocabTotal++;
        if (isCorrect) vocabCorrect++;
      } else if (skill === 'GRAMMAR') {
        grammarTotal++;
        if (isCorrect) grammarCorrect++;
      }

      if (!topicStats[topicTag]) {
        topicStats[topicTag] = {
          topicTag,
          skill: skill ?? 'GRAMMAR',
          total: 0,
          correct: 0,
        };
      }
      topicStats[topicTag].total++;
      if (isCorrect) topicStats[topicTag].correct++;
    }

    // Phương án 1 (Q-D): Lưu số câu đúng và tổng số câu theo kỹ năng
    const skillProfiles = [
      {
        skill: 'VOCABULARY',
        itemsAdministered: vocabTotal,
        correctCount: vocabCorrect,
        accuracyRate:
          vocabTotal > 0
            ? parseFloat((vocabCorrect / vocabTotal).toFixed(2))
            : 0,
      },
      {
        skill: 'GRAMMAR',
        itemsAdministered: grammarTotal,
        correctCount: grammarCorrect,
        accuracyRate:
          grammarTotal > 0
            ? parseFloat((grammarCorrect / grammarTotal).toFixed(2))
            : 0,
      },
    ];

    // Thống kê các chủ điểm làm sai nhiều
    const errorPatterns = Object.values(topicStats)
      .filter((t) => t.correct < t.total)
      .map((t) => {
        const accuracyRate = t.total > 0 ? t.correct / t.total : 0;
        const severity =
          accuracyRate < 0.4 ? 'HIGH' : accuracyRate < 0.7 ? 'MEDIUM' : 'LOW';
        return {
          topicTag: t.topicTag,
          skill: t.skill,
          itemsAttempted: t.total,
          correctCount: t.correct,
          itemsIncorrect: t.total - t.correct,
          accuracyRate: parseFloat(accuracyRate.toFixed(2)),
          severity,
        };
      })
      .sort((a, b) => a.accuracyRate - b.accuracyRate);

    // Sinh khuyến nghị AI phù hợp
    const aiRecommendations: string[] = [];
    if (errorPatterns.length > 0) {
      const topTopics = errorPatterns
        .slice(0, 3)
        .map((e) => e.topicTag)
        .join(', ');
      aiRecommendations.push(
        `Ưu tiên ôn tập và củng cố các chủ điểm còn sai sót: ${topTopics}.`,
      );
    }
    if (vocabTotal > 0 && vocabCorrect / vocabTotal < 0.6) {
      aiRecommendations.push(
        'Cần mở rộng vốn từ vựng học thuật và rèn luyện kỹ năng đoán nghĩa từ theo ngữ cảnh.',
      );
    }
    if (grammarTotal > 0 && grammarCorrect / grammarTotal < 0.6) {
      aiRecommendations.push(
        'Tập trung luyện tập các cấu trúc ngữ pháp mệnh đề và sự phối hợp thì trong câu.',
      );
    }
    if (aiRecommendations.length === 0) {
      aiRecommendations.push(
        'Duy trì kết quả tốt bằng cách tiếp tục thực hành với các tài liệu và đề thi ở mức độ cao hơn.',
      );
    }

    const existingProfile = await this.prisma.languageProfile.findUnique({
      where: { testSessionId: session.id },
    });

    const profileData = {
      studentId: session.studentId,
      testSessionId: session.id,
      completedAt: new Date(),
      theta: thetaFinal,
      standardError: seFinal,
      confidenceInterval95: [ci95Lower, ci95Upper],
      cefrLevel,
      cefrConfidence,
      boundaryEffect,
      skillProfiles,
      errorPatterns,
      testMetadata: {
        itemsAdministered: session.responses.length,
        algorithm: 'CAT-Rasch-1PL',
        thetaFinal,
        seFinal,
        stoppingReason,
      },
      aiRecommendations,
    };

    if (existingProfile) {
      await this.prisma.languageProfile.update({
        where: { id: existingProfile.id },
        data: profileData,
      });
    } else {
      await this.prisma.languageProfile.create({
        data: {
          id: randomUUID(),
          ...profileData,
        },
      });
    }
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
