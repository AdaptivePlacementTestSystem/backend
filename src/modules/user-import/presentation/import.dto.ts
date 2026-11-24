import { IsIn, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ImportKindQueryDto {
  @ApiProperty({ enum: ['STUDENT', 'TEACHER'] })
  @IsIn(['STUDENT', 'TEACHER'], {
    message: 'kind phải là STUDENT hoặc TEACHER',
  })
  kind!: 'STUDENT' | 'TEACHER';
}

export class ImportRowParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'rowKey không hợp lệ' })
  rowKey!: string;
}
