import { ApiProperty } from '@nestjs/swagger';

export class ItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() content: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  options: Record<string, string>;
  @ApiProperty() correctAnswer: string;
  @ApiProperty() skill: string;
  @ApiProperty() cefrTarget: string;
  @ApiProperty() irtB: number;
  @ApiProperty() irtA: number;
  @ApiProperty() irtC: number;
  @ApiProperty() status: string;
  @ApiProperty() batchId: string;
  @ApiProperty({ type: String, nullable: true }) packageId: string | null;
  @ApiProperty({ type: String, nullable: true }) contentHash: string | null;
  @ApiProperty({ type: String, nullable: true }) topicTag: string | null;
  @ApiProperty({ type: String, nullable: true }) approvedById: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  approvedAt: string | null;
  @ApiProperty() timesUsed: number;
  @ApiProperty() calibrated: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}
export class ItemDetailResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() content: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  options: Record<string, string>;
  @ApiProperty() correctAnswer: string;
  @ApiProperty() skill: string;
  @ApiProperty() cefrTarget: string;
  @ApiProperty() irtB: number;
  @ApiProperty() status: string;
  @ApiProperty() batchId: string;
  @ApiProperty() source: string;
  @ApiProperty({ type: String, nullable: true }) topicTag: string | null;
  @ApiProperty() timesUsed: number;
  @ApiProperty({ type: String, nullable: true }) explanation: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}
export class ExplanationResponseDto {
  @ApiProperty() explanation: string;
}
