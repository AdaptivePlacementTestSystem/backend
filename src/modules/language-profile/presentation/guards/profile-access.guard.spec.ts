import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfileAccessGuard } from './profile-access.guard';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';

describe('ProfileAccessGuard', () => {
  let guard: ProfileAccessGuard;
  let targetLookup: any;

  beforeEach(() => {
    targetLookup = {
      findStudentByCode: vi.fn(),
    };
    guard = new ProfileAccessGuard(targetLookup);
  });

  function createMockContext(user: any, studentCode: string) {
    const request: any = {
      user,
      params: { studentCode },
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      request,
    };
  }

  it('cho phép studentCode === "me" đi thẳng và gán request.targetStudent = { userId: user.sub }', async () => {
    const ctx = createMockContext(
      { sub: 'student-uuid-1', role: UserRole.STUDENT },
      'me',
    );

    const canActivate = await guard.canActivate(ctx as any);
    expect(canActivate).toBe(true);
    expect(ctx.request.targetStudent).toEqual({ userId: 'student-uuid-1' });
    expect(targetLookup.findStudentByCode).not.toHaveBeenCalled();
  });

  it('quăng ForbiddenException nếu chưa xác thực (thiếu request.user)', async () => {
    const ctx = createMockContext(null, 'SV001');

    await expect(guard.canActivate(ctx as any)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('quăng NotFoundException nếu studentCode không tồn tại trong hệ thống', async () => {
    targetLookup.findStudentByCode.mockResolvedValue(null);
    const ctx = createMockContext(
      { sub: 'admin-uuid', role: UserRole.ADMIN },
      'UNKNOWN_CODE',
    );

    await expect(guard.canActivate(ctx as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('quăng ForbiddenException nếu sinh viên A cố truy cập hồ sơ của sinh viên B', async () => {
    targetLookup.findStudentByCode.mockResolvedValue({
      userId: 'student-uuid-b',
      studentCode: 'SV002',
    });

    const ctx = createMockContext(
      { sub: 'student-uuid-a', role: UserRole.STUDENT },
      'SV002',
    );

    await expect(guard.canActivate(ctx as any)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('cho phép Admin xem hồ sơ của bất kỳ sinh viên nào', async () => {
    targetLookup.findStudentByCode.mockResolvedValue({
      userId: 'student-uuid-b',
      studentCode: 'SV002',
    });

    const ctx = createMockContext(
      { sub: 'admin-uuid', role: UserRole.ADMIN },
      'SV002',
    );

    const canActivate = await guard.canActivate(ctx as any);
    expect(canActivate).toBe(true);
    expect(ctx.request.targetStudent).toEqual({
      userId: 'student-uuid-b',
      studentCode: 'SV002',
    });
  });

  it('cho phép Giảng viên xem hồ sơ của sinh viên', async () => {
    targetLookup.findStudentByCode.mockResolvedValue({
      userId: 'student-uuid-b',
      studentCode: 'SV002',
    });

    const ctx = createMockContext(
      { sub: 'teacher-uuid', role: UserRole.TEACHER },
      'SV002',
    );

    const canActivate = await guard.canActivate(ctx as any);
    expect(canActivate).toBe(true);
  });
});
