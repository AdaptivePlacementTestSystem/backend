import { IsIn } from 'class-validator';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';

export class ChangeRoleDto {
  @IsIn([UserRole.ADMIN, UserRole.TEACHER], {
    message: 'Quyền chỉ có thể là ADMIN hoặc TEACHER',
  })
  role!: UserRole.ADMIN | UserRole.TEACHER;
}
