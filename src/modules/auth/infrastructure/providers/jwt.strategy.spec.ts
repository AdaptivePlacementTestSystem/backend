import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy.validate', () => {
  let strategy: JwtStrategy;
  let userRepository: any;

  const NOW_S = 1_800_000_000;
  const baseUser = {
    id: 'u-1',
    email: 'a@b.com',
    role: 'STUDENT',
    isActive: true,
    mustChangePassword: false,
    passwordChangedAt: null as Date | null,
  };

  beforeEach(() => {
    userRepository = { findById: vi.fn().mockResolvedValue({ ...baseUser }) };
    const config = { getOrThrow: () => 'x'.repeat(32) } as any;
    strategy = new JwtStrategy(config, userRepository);
  });

  it('từ chối payload không có sub', async () => {
    await expect(strategy.validate({} as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('từ chối khi user không còn trong DB', async () => {
    userRepository.findById.mockResolvedValue(null);
    await expect(
      strategy.validate({ sub: 'u-1', iat: NOW_S } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('từ chối khi tài khoản bị khóa dù token còn hạn', async () => {
    userRepository.findById.mockResolvedValue({ ...baseUser, isActive: false });
    await expect(
      strategy.validate({ sub: 'u-1', iat: NOW_S } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('từ chối token cấp trước lần đổi mật khẩu gần nhất', async () => {
    userRepository.findById.mockResolvedValue({
      ...baseUser,
      passwordChangedAt: new Date((NOW_S + 10) * 1000),
    });
    await expect(
      strategy.validate({ sub: 'u-1', iat: NOW_S } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('chấp nhận token cấp cùng giây với lần đổi mật khẩu (token mới sau khi đổi)', async () => {
    userRepository.findById.mockResolvedValue({
      ...baseUser,
      passwordChangedAt: new Date(NOW_S * 1000 + 900),
    });
    await expect(
      strategy.validate({ sub: 'u-1', iat: NOW_S } as any),
    ).resolves.toMatchObject({ sub: 'u-1' });
  });

  it('trả trạng thái mới nhất từ DB, gồm mustChangePassword', async () => {
    userRepository.findById.mockResolvedValue({
      ...baseUser,
      mustChangePassword: true,
    });
    await expect(
      strategy.validate({ sub: 'u-1', iat: NOW_S } as any),
    ).resolves.toEqual({
      sub: 'u-1',
      email: 'a@b.com',
      role: 'STUDENT',
      mustChangePassword: true,
    });
  });
});
