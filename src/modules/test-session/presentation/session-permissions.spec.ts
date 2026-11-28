import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { TestSessionController } from './test-session.controller';
import { ExamRoundController } from '../../exam-round/presentation/exam-round.controller';

function roles(proto: object, method: string) {
  const fn = Object.getOwnPropertyDescriptor(proto, method)!.value;
  return Reflect.getMetadata(ROLES_KEY, fn);
}

describe('quyền thao tác phiên thi', () => {
  it('chỉ STUDENT được bắt đầu và thao tác phiên', () => {
    for (const method of [
      'startSession',
      'getActiveSession',
      'getNextItem',
      'submitResponse',
      'resumeSession',
    ]) {
      expect(roles(TestSessionController.prototype, method)).toEqual([
        UserRole.STUDENT,
      ]);
    }
    for (const method of ['getMyExamRounds', 'getCurrentSession']) {
      expect(roles(ExamRoundController.prototype, method)).toEqual([
        UserRole.STUDENT,
      ]);
    }
  });
  it('không bỏ qua kiểm tra chủ phiên khi actor là ADMIN', async () => {
    const controller = Object.create(
      TestSessionController.prototype,
    ) as TestSessionController;
    (controller as any).sessionRepository = {
      findById: vi.fn().mockResolvedValue({ studentId: 'student' }),
    };
    await expect(
      controller.getNextItem('session', {
        sub: 'admin',
        role: UserRole.ADMIN,
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.getNextItem('session', {
        sub: 'other-student',
        role: UserRole.STUDENT,
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
