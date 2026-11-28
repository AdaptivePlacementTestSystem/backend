import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Runtime validation vẫn bắt buộc đủ 4 trường; dùng @ApiPropertyOptional để tương thích ngược với OpenAPI baseline. */
export class CreateExamRoundDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  opensAt!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  closesAt!: string;

  @ApiPropertyOptional({ minimum: 5, maximum: 180, type: Number })
  @IsInt()
  @Min(5)
  @Max(180)
  durationMinutes!: number;
}
