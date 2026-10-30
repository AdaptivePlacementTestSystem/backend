import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaLanguageProfileRepository } from '../../infrastructure/persistence/prisma-language-profile.repository';

export interface EduZLanguageProfileJson {
  schema_version: string;
  student_id: string;
  test_session_id: string;
  completed_at: string;
  overall: {
    theta: number;
    standard_error: number;
    confidence_interval_95: [number, number];
    cefr_level: string;
    cefr_confidence: string;
    boundary_effect: boolean;
  };
  skills: any[];
  error_patterns: any[];
  ai_recommendations: string[];
  metadata: Record<string, any>;
}

@Injectable()
export class ExportForEduZUseCase {
  constructor(
    private readonly profileRepository: PrismaLanguageProfileRepository,
  ) {}

  async execute(
    studentId: string,
    studentCode: string,
  ): Promise<EduZLanguageProfileJson> {
    const profile =
      await this.profileRepository.findLatestByStudentId(studentId);
    if (!profile) {
      throw new NotFoundException('Không tìm thấy hồ sơ năng lực để xuất');
    }

    return {
      schema_version: profile.schemaVersion,
      student_id: studentCode,
      test_session_id: profile.testSessionId,
      completed_at: profile.completedAt.toISOString(),
      overall: {
        theta: profile.abilityEstimate.theta,
        standard_error: profile.abilityEstimate.standardError,
        confidence_interval_95: profile.abilityEstimate.confidenceInterval95,
        cefr_level: profile.cefrLevel === 'C1_PLUS' ? 'C1+' : profile.cefrLevel,
        cefr_confidence: profile.cefrConfidence.toLowerCase(),
        boundary_effect: profile.boundaryEffect,
      },
      skills: profile.skillProfiles,
      error_patterns: profile.errorPatterns,
      ai_recommendations: profile.aiRecommendations,
      metadata: profile.testMetadata,
    };
  }
}
