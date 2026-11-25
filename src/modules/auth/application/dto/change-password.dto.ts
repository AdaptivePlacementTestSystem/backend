import { IsNotEmpty, IsString } from 'class-validator';
import { StrongPassword } from './password-policy';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString({ message: 'Mật khẩu hiện tại phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mật khẩu hiện tại không được để trống' })
  currentPassword: string;

  @ApiProperty()
  @StrongPassword()
  newPassword: string;
}

export class ChangePasswordResponseDto {
  @ApiProperty()
  accessToken: string;
}
