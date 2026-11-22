import {
  IsDateString,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateExamRoundDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsDateString()
  opensAt!: string;

  @IsDateString()
  closesAt!: string;

  @IsInt()
  @Min(5)
  @Max(180)
  durationMinutes!: number;
}
