import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestSessionController } from './test-session.controller';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ROLES_KEY } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { GetSessionReviewUseCase } from '../application/use-cases/get-session-review.use-case';
import { SessionStatus } from '../domain/entities/test-session.entity';
import type { JwtPayload } from '../../../shared/decorators/current-user.decorator';

describe('TestSessionController - IDOR & Authorization Security Tests', () => {
  let controller: TestSessionController;
  let sessionRepository: any;
  let resumeSessionUseCase: any;
  let submitResponseUseCase: any;
  let getSessionResultUseCase: any;
  let getSessionReviewUseCase: any;
  let startSessionUseCase: any;
  let getActiveSessionUseCase: any;
  let catEngineService: any;
  let cacheService: any;

  const studentA: JwtPayload = {
    sub: 'student-A-id',
    email: 'studentA@test.com',
    role: UserRole.STUDENT,
  };

  const studentB: JwtPayload = {
    sub: 'student-B-id',
    email: 'studentB@test.com',
    role: UserRole.STUDENT,
  };

  const adminUser: JwtPayload = {
    sub: 'admin-id',
    email: 'admin@test.com',
    role: UserRole.ADMIN,
  };

  const sessionOfStudentB = {
    id: 'session-student-b',
    studentId: 'student-B-id',
    examRoundId: 'round-1',
  };

  beforeEach(() => {
    sessionRepository = {
      findById: vi.fn((id: string) => {
        if (id === sessionOfStudentB.id)
          return Promise.resolve(sessionOfStudentB);
        return Promise.resolve(null);
      }),
    };
    resumeSessionUseCase = {
      execute: vi.fn().mockResolvedValue({ currentItem: null, state: {} }),
    };
    submitResponseUseCase = {
      execute: vi.fn().mockResolvedValue({ shouldStop: false }),
    };
    getSessionResultUseCase = {
      execute: vi.fn((sessionId, userId, userRole) => {
        if (userRole !== UserRole.ADMIN && userId !== 'student-B-id') {
          throw new ForbiddenException(
            'Bạn không có quyền xem kết quả bài thi này',
          );
        }
        return Promise.resolve({ sessionId });
      }),
    };
    getSessionReviewUseCase = {
      execute: vi.fn((sessionId, userId, userRole) => {
        if (userRole !== UserRole.STUDENT || userId !== 'student-B-id') {
          throw new ForbiddenException(
            'Chỉ sinh viên chủ sở hữu mới có quyền xem lại bài thi này',
          );
        }
        return Promise.resolve([]);
      }),
    };
    startSessionUseCase = { execute: vi.fn() };
    getActiveSessionUseCase = { execute: vi.fn() };
    catEngineService = { selectNextItem: vi.fn() };
    cacheService = { getState: vi.fn(), setState: vi.fn() };
    const computeResultUseCase = { execute: vi.fn() };
    const sessionCleanupService = {
      cleanupIfExpired: vi.fn().mockResolvedValue({ isExpired: false }),
    };
    const configService = { get: vi.fn().mockReturnValue(25) };
    const itemRepository = { findById: vi.fn(), findForCAT: vi.fn() };

    controller = new TestSessionController(
      startSessionUseCase,
      submitResponseUseCase,
      resumeSessionUseCase,
      getActiveSessionUseCase,
      getSessionResultUseCase,
      getSessionReviewUseCase,
      computeResultUseCase as any,
      sessionCleanupService as any,
      configService as any,
      sessionRepository,
      catEngineService,
      cacheService,
      itemRepository as any,
    );
  });

  describe('Chặn IDOR trên GET /sessions/:id/resume', () => {
    it('quăng ForbiddenException (403) khi Sinh viên A cố khôi phục phiên của Sinh viên B', async () => {
      await expect(
        controller.resumeSession(sessionOfStudentB.id, studentA),
      ).rejects.toThrow(ForbiddenException);

      expect(resumeSessionUseCase.execute).not.toHaveBeenCalled();
    });

    it('cho phép Sinh viên B khôi phục phiên chính chủ của mình', async () => {
      const res = await controller.resumeSession(
        sessionOfStudentB.id,
        studentB,
      );
      expect(res).toBeDefined();
      expect(resumeSessionUseCase.execute).toHaveBeenCalledWith(
        sessionOfStudentB.id,
      );
    });

    it('quăng NotFoundException nếu session không tồn tại', async () => {
      await expect(
        controller.resumeSession('non-existent-session', studentA),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Chặn IDOR trên POST /sessions/:id/responses', () => {
    it('quăng ForbiddenException (403) khi Sinh viên A cố nộp bài cho phiên của Sinh viên B', async () => {
      await expect(
        controller.submitResponse(
          sessionOfStudentB.id,
          { itemId: 'item-1', response: 'A' },
          studentA,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(submitResponseUseCase.execute).not.toHaveBeenCalled();
    });

    it('cho phép Sinh viên B nộp câu trả lời cho phiên của mình', async () => {
      const res = await controller.submitResponse(
        sessionOfStudentB.id,
        { itemId: 'item-1', response: 'A' },
        studentB,
      );
      expect(res.shouldStop).toBe(false);
      expect(submitResponseUseCase.execute).toHaveBeenCalled();
    });
  });

  describe('Chặn IDOR trên GET /sessions/:id/result', () => {
    it('quăng ForbiddenException (403) khi Sinh viên A cố xem kết quả của Sinh viên B', async () => {
      await expect(
        controller.getResult(sessionOfStudentB.id, studentA),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cho phép Admin xem kết quả của bất kỳ sinh viên nào', async () => {
      const res = await controller.getResult(sessionOfStudentB.id, adminUser);
      expect(res.sessionId).toBe(sessionOfStudentB.id);
    });
  });

  describe('Chặn IDOR & Role trên GET /sessions/:id/review & TestSessionController (WP-9.1 / K6)', () => {
    it('quăng ForbiddenException (403) khi Sinh viên A cố xem giải thích AI bài thi của Sinh viên B', async () => {
      await expect(
        controller.getReview(sessionOfStudentB.id, studentA),
      ).rejects.toThrow(ForbiddenException);
    });

    it('chặn ADMIN thao tác resume / submit / review phiên của sinh viên (K6)', async () => {
      await expect(
        controller.resumeSession(sessionOfStudentB.id, adminUser),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        controller.submitResponse(
          sessionOfStudentB.id,
          { itemId: 'item-1', response: 'A' },
          adminUser,
        ),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        controller.getReview(sessionOfStudentB.id, adminUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('gắn @Roles(UserRole.STUDENT) cho các endpoint làm bài và xem lại đáp án', () => {
      const proto = TestSessionController.prototype;
      for (const method of [
        proto.startSession,
        proto.getActiveSession,
        proto.getNextItem,
        proto.submitResponse,
        proto.resumeSession,
        proto.getReview,
      ]) {
        expect(Reflect.getMetadata(ROLES_KEY, method)).toEqual([
          UserRole.STUDENT,
        ]);
      }
    });

    it('GetSessionReviewUseCase thực tế chặn ADMIN và chặn phiên chưa COMPLETED', async () => {
      const prismaMock: any = {
        testSession: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'sess-1',
            studentId: 'student-B-id',
            status: SessionStatus.COMPLETED,
            responses: [],
          }),
        },
      };
      const configMock: any = { get: vi.fn().mockReturnValue(true) };
      const uc = new GetSessionReviewUseCase(prismaMock, configMock);

      await expect(
        uc.execute('sess-1', adminUser.sub, UserRole.ADMIN),
      ).rejects.toThrow(ForbiddenException);

      prismaMock.testSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        studentId: 'student-B-id',
        status: SessionStatus.IN_PROGRESS,
        responses: [],
      });
      await expect(
        uc.execute('sess-1', 'student-B-id', UserRole.STUDENT),
      ).rejects.toThrow('Chỉ có thể xem lại bài thi sau khi đã hoàn thành');
    });
  });
});
