import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../auth/domain/enums/user-role.enum';

export class AccountResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() fullName: string;
  @ApiProperty({ format: 'email' }) email: string;
  @ApiProperty({ enum: [UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN] })
  role: UserRole;
  @ApiPropertyOptional() studentCode?: string;
  @ApiPropertyOptional() teacherCode?: string;
  @ApiProperty() isActive: boolean;
  @ApiProperty() mustChangePassword: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class AccountPageResponseDto {
  @ApiProperty({ type: [AccountResponseDto] }) items: AccountResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}
