import { describe, it, expect } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ErrorCode } from '@apt/shared-types';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard.handleRequest', () => {
  const context = {
    getHandler: () => 'handler',
    getClass: () => 'class',
  } as any;

  const guardWith = (allowed: boolean | undefined) =>
    new JwtAuthGuard({ getAllAndOverride: () => allowed } as any);

  const user = (mustChangePassword: boolean) => ({
    sub: 'u-1',
    email: 'a@b.com',
    role: 'STUDENT',
    mustChangePassword,
  });

  it('ném 401 khi không có user', () => {
    expect(() =>
      guardWith(undefined).handleRequest(null, false, null, context),
    ).toThrow(UnauthorizedException);
  });

  it('cho qua khi không cần đổi mật khẩu', () => {
    const u = user(false);
    expect(guardWith(undefined).handleRequest(null, u, null, context)).toBe(u);
  });

  it('chặn 403 PASSWORD_CHANGE_REQUIRED khi còn cờ đổi mật khẩu và endpoint không được phép', () => {
    try {
      guardWith(undefined).handleRequest(null, user(true), null, context);
      expect.unreachable('phải ném ForbiddenException');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getResponse()).toMatchObject({
        code: ErrorCode.PASSWORD_CHANGE_REQUIRED,
      });
    }
  });

  it('cho qua endpoint gắn @AllowWhenMustChangePassword dù còn cờ', () => {
    const u = user(true);
    expect(guardWith(true).handleRequest(null, u, null, context)).toBe(u);
  });
});
