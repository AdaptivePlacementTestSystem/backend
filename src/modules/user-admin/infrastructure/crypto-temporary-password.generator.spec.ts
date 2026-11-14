import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import {
  CryptoTemporaryPasswordGenerator,
  TEMPORARY_PASSWORD_LENGTH,
} from './crypto-temporary-password.generator';
import { PASSWORD_POLICY } from '../../auth/application/dto/password-policy';
import { IsStrongPassword } from 'class-validator';

class PolicyProbe {
  @IsStrongPassword({ ...PASSWORD_POLICY })
  value!: string;
}

describe('CryptoTemporaryPasswordGenerator', () => {
  const generator = new CryptoTemporaryPasswordGenerator();

  it('sinh đúng 12 ký tự (BR-05)', () => {
    expect(TEMPORARY_PASSWORD_LENGTH).toBe(12);
    expect(generator.generate()).toHaveLength(12);
  });

  it('luôn thỏa chính sách mật khẩu (chữ thường, chữ hoa, số, ký tự đặc biệt)', async () => {
    for (let i = 0; i < 200; i++) {
      const probe = new PolicyProbe();
      probe.value = generator.generate();
      expect(await validate(probe)).toHaveLength(0);
    }
  });

  it('các lần sinh khác nhau', () => {
    const set = new Set(Array.from({ length: 50 }, () => generator.generate()));
    expect(set.size).toBe(50);
  });
});
