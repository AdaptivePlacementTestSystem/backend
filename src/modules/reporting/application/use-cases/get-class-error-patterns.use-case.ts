import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ErrorCode } from '@apt/shared-types';

export interface ClassErrorPatternDto {
  topicTag: string;
  skill: string;
  studentCount: number;
  errorRate: number;
  totalAttempted: number;
  totalIncorrect: number;
}

@Injectable()
export class GetClassErrorPatternsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(examRoundId?: string): Promise<ClassErrorPatternDto[]> {
    if (examRoundId) {
      const round = await this.prisma.examRound.findUnique({
        where: { id: examRoundId },
        select: { id: true },
      });
      if (!round) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Không tìm thấy kỳ thi.',
        });
      }
    }

    const where: any = {};
    if (examRoundId) {
      where.testSession = { examRoundId };
    }

    const profiles = await this.prisma.languageProfile.findMany({
      where,
      select: {
        errorPatterns: true,
      },
    });

    const topicMap = new Map<
      string,
      {
        topicTag: string;
        skill: string;
        studentCount: number;
        totalAttempted: number;
        totalIncorrect: number;
      }
    >();

    for (const p of profiles) {
      const patterns = Array.isArray(p.errorPatterns) ? p.errorPatterns : [];
      for (const ep of patterns as any[]) {
        const topic = ep.topicTag || ep.topic;
        if (!topic) continue;
        const skill = ep.skill || 'GRAMMAR';
        const attempted = Number(ep.itemsAttempted || ep.count || 1);
        const incorrect = Number(
          ep.itemsIncorrect !== undefined ? ep.itemsIncorrect : ep.count || 1,
        );

        const key = `${topic}::${skill}`;
        const existing = topicMap.get(key);
        if (!existing) {
          topicMap.set(key, {
            topicTag: topic,
            skill,
            studentCount: 1,
            totalAttempted: attempted,
            totalIncorrect: incorrect,
          });
        } else {
          existing.studentCount += 1;
          existing.totalAttempted += attempted;
          existing.totalIncorrect += incorrect;
        }
      }
    }

    const results: ClassErrorPatternDto[] = [];
    for (const item of topicMap.values()) {
      const rate =
        item.totalAttempted > 0
          ? Math.round((item.totalIncorrect / item.totalAttempted) * 100)
          : 0;
      results.push({
        topicTag: item.topicTag,
        skill: item.skill,
        studentCount: item.studentCount,
        errorRate: rate,
        totalAttempted: item.totalAttempted,
        totalIncorrect: item.totalIncorrect,
      });
    }

    // Sắp xếp giảm dần theo tỷ lệ lỗi (%), sau đó theo số sinh viên mắc lỗi
    results.sort(
      (a, b) => b.errorRate - a.errorRate || b.studentCount - a.studentCount,
    );

    return results;
  }
}
