import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AbilityResponseDto {
  @ApiProperty() theta: number;
  @ApiProperty() standardError: number;
  @ApiProperty({ type: [Number] }) confidenceInterval95: number[];
}

export class StudentHistoryResponseDto {
  @ApiProperty() sessionId: string;
  @ApiProperty() examRoundId: string;
  @ApiProperty() examRoundTitle: string;
  @ApiProperty({ format: 'date-time' }) startedAt: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  completedAt: string | null;
  @ApiProperty() itemsAdministered: number;
  @ApiProperty({ type: String, nullable: true }) cefrLevel: string | null;
  @ApiProperty({ type: Number, nullable: true }) theta: number | null;
  @ApiProperty({ type: Number, nullable: true }) standardError: number | null;
  @ApiProperty() status: string;
  @ApiProperty({ type: String, nullable: true }) stoppingReason: string | null;
}

export class ProfileStudentInfoDto {
  @ApiProperty() id: string;
  @ApiProperty() studentCode: string;
  @ApiProperty() fullName: string;
  @ApiProperty() email: string;
}

export class ProfileMetaDto {
  @ApiProperty({ type: String, nullable: true })
  stoppingReason: string | null;
  @ApiProperty({ type: Number, nullable: true }) totalItems: number | null;
  @ApiProperty({ type: Number, nullable: true })
  itemsAdministered: number | null;
}

export class LatestProfileDto {
  @ApiProperty() sessionId: string;
  @ApiProperty({ format: 'date-time' }) completedAt: string;
  @ApiProperty() cefrLevel: string;
  @ApiProperty() cefrConfidence: string;
  @ApiProperty() boundaryEffect: boolean;
  @ApiProperty({ type: AbilityResponseDto }) ability: AbilityResponseDto;
  @ApiProperty({ type: ProfileMetaDto }) meta: ProfileMetaDto;
  @ApiProperty({ type: 'array', items: {} }) skillProfiles: unknown[];
  @ApiProperty({ type: 'array', items: {} }) errorPatterns: unknown[];
  @ApiPropertyOptional({ type: [String] }) aiRecommendations?: string[];
}

export class LanguageProfileResponseDto {
  @ApiProperty({ type: ProfileStudentInfoDto }) student: ProfileStudentInfoDto;
  @ApiProperty({ type: LatestProfileDto, nullable: true })
  latest: LatestProfileDto | null;
  @ApiProperty({ type: [StudentHistoryResponseDto] })
  history: StudentHistoryResponseDto[];
}

export class EduZOverallDto {
  @ApiProperty() theta: number;
  @ApiProperty() standard_error: number;
  @ApiProperty({ type: [Number] }) confidence_interval_95: number[];
  @ApiProperty() cefr_level: string;
  @ApiProperty() cefr_confidence: string;
  @ApiProperty() boundary_effect: boolean;
}

export class EduZProfileResponseDto {
  @ApiProperty() schema_version: string;
  @ApiProperty() student_id: string;
  @ApiProperty() test_session_id: string;
  @ApiProperty({ format: 'date-time' }) completed_at: string;
  @ApiProperty({ type: EduZOverallDto }) overall: EduZOverallDto;
  @ApiProperty({ type: 'array', items: {} }) skills: unknown[];
  @ApiProperty({ type: 'array', items: {} }) error_patterns: unknown[];
  @ApiProperty({ type: [String] }) ai_recommendations: string[];
  @ApiProperty({ type: 'object', additionalProperties: true }) metadata: Record<
    string,
    unknown
  >;
}
