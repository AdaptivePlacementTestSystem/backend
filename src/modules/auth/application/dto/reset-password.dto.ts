import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';
import { StrongPassword } from './password-policy';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ format: 'email' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email: string;

  @ApiProperty({ pattern: '^\\d{6}$' })
  @IsString({ message: 'Mã OTP phải là chuỗi ký tự' })
  @Matches(/^\d{6}$/, { message: 'Mã OTP phải gồm đúng 6 chữ số' })
  @IsNotEmpty({ message: 'Mã OTP không được để trống' })
  otp: string;

  @ApiProperty()
  @StrongPassword()
  newPassword: string;
}
