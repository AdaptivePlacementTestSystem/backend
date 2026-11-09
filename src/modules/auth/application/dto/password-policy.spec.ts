import { describe, it, expect } from 'vitest';
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';
import { LoginDto } from './login.dto';
import { ResetPasswordDto } from './reset-password.dto';

const errorsFor = async (newPassword: string) =>
  validate(
    plainToInstance(ChangePasswordDto, { currentPassword: 'x', newPassword }),
  );

describe('Chính sách mật khẩu (D4)', () => {
  it.each([
    ['Abcdef@1', 'đủ 4 nhóm, đúng 8 ký tự'],
    ['Mật-khẩu-Rất-Dài_2026!', 'dài, đủ 4 nhóm'],
  ])('chấp nhận %s (%s)', async (pw) => {
    expect(await errorsFor(pw)).toHaveLength(0);
  });

  it.each([
    ['Ab@1xyz', 'ngắn hơn 8 ký tự'],
    ['abcdef@1', 'thiếu chữ Hoa'],
    ['ABCDEF@1', 'thiếu chữ thường'],
    ['Abcdefg@', 'thiếu chữ số'],
    ['Abcdefg1', 'thiếu ký tự đặc biệt'],
    ['', 'rỗng'],
  ])('từ chối %s (%s)', async (pw) => {
    expect((await errorsFor(pw)).length).toBeGreaterThan(0);
  });

  it('áp dụng cho cả đặt lại mật khẩu', async () => {
    const errors = await validate(
      plainToInstance(ResetPasswordDto, {
        email: 'a@b.com',
        otp: '123456',
        newPassword: 'weakpass',
      }),
    );
    expect(errors.some((e) => e.property === 'newPassword')).toBe(true);
  });

  it('đăng nhập không ràng buộc độ dài/độ phức tạp (tài khoản cũ vẫn đăng nhập được)', async () => {
    const errors = await validate(
      plainToInstance(LoginDto, { email: 'a@b.com', password: 'abc' }),
    );
    expect(errors).toHaveLength(0);
  });
});
