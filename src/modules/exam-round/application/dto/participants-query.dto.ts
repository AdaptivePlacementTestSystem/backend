import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ParticipantsQueryDto {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional()
  @IsIn(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'])
  status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
