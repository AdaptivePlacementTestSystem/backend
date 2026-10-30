import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { LanguageProfileEntity } from '../../domain/entities/language-profile.entity';
import { AbilityEstimateEntity } from '../../../cat-engine/domain/entities/ability-estimate.entity';

@Injectable()
export class PrismaLanguageProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findLatestByStudentId(
    studentId: string,
  ): Promise<LanguageProfileEntity | null> {
    const raw = await this.prisma.languageProfile.findFirst({
      where: { studentId },
      orderBy: { completedAt: 'desc' },
    });

    if (!raw) return null;

    const [lower, upper] = raw.confidenceInterval95;
    const ability = new AbilityEstimateEntity(raw.theta, raw.standardError, [
      lower,
      upper,
    ]);

    return new LanguageProfileEntity(
      raw.id,
      raw.studentId,
      raw.testSessionId,
      raw.completedAt,
      ability,
      raw.cefrLevel,
      raw.cefrConfidence,
      raw.boundaryEffect,
      raw.skillProfiles as any[],
      raw.errorPatterns as any[],
      raw.testMetadata as Record<string, any>,
      raw.aiRecommendations,
      raw.schemaVersion,
    );
  }
}
