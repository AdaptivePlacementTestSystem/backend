import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportRowResponseDto {
  @ApiProperty() rowKey: string;
  @ApiProperty() code: string;
  @ApiProperty() fullName: string;
  @ApiProperty() email: string;
}
export class RejectedImportRowDto {
  @ApiProperty() row: number;
  @ApiProperty({
    enum: ['MISSING_FIELD', 'INVALID_EMAIL', 'DUPLICATE_IN_FILE'],
  })
  code: string;
  @ApiProperty() reason: string;
}
export class ExistingImportRowDto {
  @ApiProperty() row: number;
  @ApiProperty({ enum: ['email', 'code'] }) field: string;
  @ApiProperty() value: string;
}
export class ImportGridResponseDto {
  @ApiProperty({ type: [ImportRowResponseDto] }) grid: ImportRowResponseDto[];
}
export class ImportUploadResponseDto extends ImportGridResponseDto {
  @ApiProperty({ type: [RejectedImportRowDto] })
  rejected: RejectedImportRowDto[];
  @ApiProperty({ type: [ExistingImportRowDto] })
  existing: ExistingImportRowDto[];
  @ApiProperty() added: number;
  @ApiProperty() ignoredDuplicates: number;
}
export class ImportSaveResponseDto {
  @ApiProperty() total: number;
}
export class ImportJobErrorDto {
  @ApiProperty({ enum: ['CONFLICT', 'UNKNOWN'] }) code: string;
  @ApiProperty() message: string;
  @ApiPropertyOptional({ type: [ExistingImportRowDto] })
  conflicts?: ExistingImportRowDto[];
}
export class ImportJobResponseDto {
  @ApiProperty({ enum: ['PROCESSING', 'DONE', 'FAILED'] }) status: string;
  @ApiProperty() total: number;
  @ApiProperty() processed: number;
  @ApiPropertyOptional() created?: number;
  @ApiPropertyOptional() queued?: number;
  @ApiPropertyOptional({ type: ImportJobErrorDto }) error?: ImportJobErrorDto;
  @ApiProperty({ format: 'date-time' }) startedAt: string;
  @ApiPropertyOptional({ format: 'date-time' }) finishedAt?: string;
}
export class NoImportJobResponseDto {
  @ApiProperty({ enum: ['NONE'] }) status: string;
}
