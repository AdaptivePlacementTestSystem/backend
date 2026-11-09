import { applyDecorators } from '@nestjs/common';
import { IsNotEmpty, IsString, IsStrongPassword } from 'class-validator';

/**
 * Chính sách mật khẩu (DECISIONS_LOG #134, D4): tối thiểu 8 ký tự, bắt buộc
 * chữ thường, chữ Hoa, chữ số và ký tự đặc biệt.
 * Chỉ áp dụng khi ĐẶT mật khẩu mới (đổi / đặt lại); đăng nhập không ràng buộc.
 */
export const PASSWORD_POLICY = {
  minLength: 8,
  minLowercase: 1,
  minUppercase: 1,
  minNumbers: 1,
  minSymbols: 1,
} as const;

export const PASSWORD_POLICY_MESSAGE =
  'Mật khẩu mới phải có ít nhất 8 ký tự, gồm chữ thường, chữ hoa, chữ số và ký tự đặc biệt';

export function StrongPassword(): PropertyDecorator {
  return applyDecorators(
    IsString({ message: 'Mật khẩu mới phải là chuỗi ký tự' }),
    IsNotEmpty({ message: 'Mật khẩu mới không được để trống' }),
    IsStrongPassword(
      { ...PASSWORD_POLICY },
      { message: PASSWORD_POLICY_MESSAGE },
    ),
  );
}
