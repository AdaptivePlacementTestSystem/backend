import { ApiProperty } from '@nestjs/swagger';

export class DistributionReportDto {
  @ApiProperty({ type: String, nullable: true }) examRoundId: string | null;
  @ApiProperty() totalStudents: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  cefrDistribution: Record<string, number>;
  @ApiProperty() averageTheta: number;
  @ApiProperty({ format: 'date-time' }) generatedAt: string;
}
export class OpenRoundSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ format: 'date-time' }) opensAt: string;
  @ApiProperty({ format: 'date-time' }) closesAt: string;
  @ApiProperty() durationMinutes: number;
  @ApiProperty() participantCount: number;
  @ApiProperty() notStarted: number;
  @ApiProperty() inProgress: number;
  @ApiProperty() completed: number;
}
export class SystemOverviewDto {
  @ApiProperty({ type: String, nullable: true }) examRoundId: string | null;
  @ApiProperty() studentsCompleted: number;
  @ApiProperty() finalApprovedItems: number;
  @ApiProperty() batchesNeedingAction: number;
  @ApiProperty() openExamRounds: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  cefrDistribution: Record<string, number>;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
  itemStatusCounts: Record<string, number>;
  @ApiProperty({ type: [OpenRoundSummaryDto] })
  openRounds: OpenRoundSummaryDto[];
  @ApiProperty({ format: 'date-time' }) generatedAt: string;
}
export class ClassErrorPatternDto {
  @ApiProperty() topicTag: string;
  @ApiProperty() skill: string;
  @ApiProperty() studentCount: number;
  @ApiProperty() errorRate: number;
  @ApiProperty() totalAttempted: number;
  @ApiProperty() totalIncorrect: number;
  @ApiProperty() itemsAttempted: number;
  @ApiProperty() correctCount: number;
  @ApiProperty() accuracyRate: number;
  @ApiProperty() severity: string;
}
