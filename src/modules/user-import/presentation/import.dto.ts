import { IsIn, IsUUID } from 'class-validator';

export class ImportKindQueryDto {
  @IsIn(['STUDENT', 'TEACHER'], {
    message: 'kind phải là STUDENT hoặc TEACHER',
  })
  kind!: 'STUDENT' | 'TEACHER';
}

export class ImportRowParamDto {
  @IsUUID('all', { message: 'rowKey không hợp lệ' })
  rowKey!: string;
}
