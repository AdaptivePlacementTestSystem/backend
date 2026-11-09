import { IsNotEmpty, IsString } from 'class-validator';
import { StrongPassword } from './password-policy';

export class ChangePasswordDto {
  @IsString({ message: 'Mật khẩu hiện tại phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Mật khẩu hiện tại không được để trống' })
  currentPassword: string;

  @StrongPassword()
  newPassword: string;
}

export class ChangePasswordResponseDto {
  accessToken: string;
}
