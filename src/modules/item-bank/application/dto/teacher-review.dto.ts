import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ReviewAction, ItemStatus, Skill, CEFRLevel } from '@apt/shared-types';

export class OptionMap {
  @ApiProperty()
  @IsString()
  A: string;

  @ApiProperty()
  @IsString()
  B: string;

  @ApiProperty()
  @IsString()
  C: string;

  @ApiProperty()
  @IsString()
  D: string;
}

export class OriginalSnapshotDto {
  @ApiProperty() content: string;
  @ApiProperty({ type: OptionMap }) options: OptionMap;
  @ApiProperty() correctAnswer: string;
  @ApiProperty() explanation: string;
}

export class FirstReviewDetailDto {
  @ApiProperty({ format: 'date-time' }) dueAt: string;
  @ApiProperty({ enum: ReviewAction, nullable: true })
  action: ReviewAction | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  reviewedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) comment: string | null;
  @ApiProperty({ type: OriginalSnapshotDto, nullable: true })
  originalSnapshot: OriginalSnapshotDto | null;
}

export class SecondReviewDetailDto {
  @ApiProperty({ format: 'date-time' }) dueAt: string;
  @ApiProperty({ enum: ReviewAction, nullable: true })
  action: ReviewAction | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  confirmedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) comment: string | null;
}

export class ItemFlagDto {
  @ApiProperty() level: string;
  @ApiProperty({ type: [String] }) reasonCodes: string[];
  @ApiPropertyOptional({ type: String, nullable: true })
  suspectedDuplicateId?: string | null;
}

export class ReviewItemDetailDto {
  @ApiProperty() id: string;
  @ApiProperty() content: string;
  @ApiProperty({ type: OptionMap }) options: OptionMap;
  @ApiProperty() correctAnswer: string;
  @ApiProperty({ enum: Skill }) skill: Skill | string;
  @ApiProperty({ enum: CEFRLevel }) cefrTarget: CEFRLevel | string;
  @ApiProperty({ type: String, nullable: true }) topicTag: string | null;
  @ApiProperty() irtB: number;
  @ApiProperty({ enum: ItemStatus }) status: ItemStatus | string;
  @ApiProperty() explanation: string;
  @ApiProperty({ type: FirstReviewDetailDto, nullable: true })
  firstReview: FirstReviewDetailDto | null;
  @ApiPropertyOptional({ type: SecondReviewDetailDto, nullable: true })
  secondReview?: SecondReviewDetailDto | null;
  @ApiProperty() hasEdited: boolean;
  @ApiProperty({ type: [ItemFlagDto] }) flags: ItemFlagDto[];
  @ApiPropertyOptional() reviewerName?: string;
}

export class ReviewBatchSummaryDto {
  @ApiProperty() batchId: string;
  @ApiProperty() batchName: string;
  @ApiProperty() totalAssigned: number;
  @ApiProperty() decidedCount: number;
  @ApiProperty() pendingCount: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueAt: string | null;
  @ApiProperty() isOverdue: boolean;
}

export class TeacherTaskStatsDto {
  @ApiProperty() pendingReviews: number;
  @ApiProperty() pendingConfirms: number;
}

export class ReviewTasksResponseDto {
  @ApiProperty({ type: [ReviewBatchSummaryDto] })
  batches: ReviewBatchSummaryDto[];
  @ApiProperty({ type: TeacherTaskStatsDto }) stats: TeacherTaskStatsDto;
}

export class ConfirmBatchSummaryDto {
  @ApiProperty() batchId: string;
  @ApiProperty() batchName: string;
  @ApiProperty() totalAssigned: number;
  @ApiProperty() pendingCount: number;
  @ApiProperty() confirmedCount: number;
  @ApiProperty() removedCount: number;
  @ApiProperty() decidedCount: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  dueAt: string | null;
  @ApiProperty() isOverdue: boolean;
}

export class ConfirmTasksResponseDto {
  @ApiProperty({ type: [ConfirmBatchSummaryDto] })
  batches: ConfirmBatchSummaryDto[];
  @ApiProperty({ type: TeacherTaskStatsDto }) stats: TeacherTaskStatsDto;
}

export class BatchItemsResponseDto {
  @ApiProperty() batchId: string;
  @ApiProperty() batchName: string;
  @ApiProperty() totalCount: number;
  @ApiProperty() decidedCount: number;
  @ApiProperty({ type: [ReviewItemDetailDto] })
  items: ReviewItemDetailDto[];
}

export class ReviewActionResultDto {
  @ApiProperty() success: boolean;
  @ApiProperty() itemId: string;
  @ApiProperty({ enum: ItemStatus }) status: ItemStatus;
  @ApiProperty() batchFinalized: boolean;
}

export class ConfirmAllResultDto {
  @ApiProperty() success: boolean;
  @ApiProperty() confirmedCount: number;
  @ApiProperty() batchFinalized: boolean;
}

export class EditItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: OptionMap })
  @IsOptional()
  @ValidateNested()
  @Type(() => OptionMap)
  options?: OptionMap;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  correctAnswer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  explanation?: string;
}

export class ReviewCommentDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Ghi chú tùy chọn khi duyệt / xác nhận câu hỏi',
  })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class RequiredReviewCommentDto {
  @ApiProperty({
    type: String,
    minLength: 1,
    description: 'Lý do bắt buộc khi từ chối hoặc loại bỏ câu hỏi (Q1)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Lý do phải là chuỗi văn bản' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do trước khi xác nhận' })
  comment: string;
}

export class ReviewDecisionDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  action: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class ConfirmDecisionDto {
  @ApiProperty({ enum: ['CONFIRM', 'REMOVE'] })
  action: 'CONFIRM' | 'REMOVE';

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  comment?: string;
}
