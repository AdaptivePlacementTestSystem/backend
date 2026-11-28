import {
  IsDateString,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateExamRoundDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  opensAt?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString()
  closesAt?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(5)
  @Max(180)
  durationMinutes?: number;
}
