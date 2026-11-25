import { IsIn } from 'class-validator';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeRoleDto {
  @ApiProperty({ enum: [UserRole.ADMIN, UserRole.TEACHER] })
  @IsIn([UserRole.ADMIN, UserRole.TEACHER], {
    message: 'Quyền chỉ có thể là ADMIN hoặc TEACHER',
  })
  role!: UserRole.ADMIN | UserRole.TEACHER;
}
