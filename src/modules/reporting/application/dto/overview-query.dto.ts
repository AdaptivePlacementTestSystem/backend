import { IsOptional, IsUUID } from 'class-validator';

export class OverviewQueryDto {
  @IsOptional()
  @IsUUID('all', { message: 'examRoundId phải là UUID hợp lệ' })
  examRoundId?: string;
}
