import { CEFRLevel, CEFRConfidence } from '@prisma/client';
import { AbilityEstimateEntity } from '../../../cat-engine/domain/entities/ability-estimate.entity';

/**
 * Domain Entity LanguageProfile — Aggregate Root đại diện hồ sơ năng lực tiếng Anh (SRS v3.0).
 * Chứa kết quả xếp lớp cuối cùng để phục vụ sinh viên, giảng viên và EduZ Ecosystem.
 */
export class LanguageProfileEntity {
  constructor(
    public readonly id: string,
    public readonly studentId: string,
    public readonly testSessionId: string,
    public readonly completedAt: Date,
    public readonly abilityEstimate: AbilityEstimateEntity,
    public readonly cefrLevel: CEFRLevel,
    public readonly cefrConfidence: CEFRConfidence,
    public readonly boundaryEffect: boolean = false,
    public readonly skillProfiles: any[] = [],
    public readonly errorPatterns: any[] = [],
    public readonly testMetadata: Record<string, any> = {},
    public readonly aiRecommendations: string[] = [],
    public readonly schemaVersion: string = '1.0',
  ) {}
}
