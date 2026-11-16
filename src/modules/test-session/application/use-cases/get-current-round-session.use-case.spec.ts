import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetCurrentRoundSessionUseCase } from './get-current-round-session.use-case';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import {
  SessionStatus,
  StoppingReason,
} from '../../domain/entities/test-session.entity';

describe('GetCurrentRoundSessionUseCase', () => {
  let useCase: GetCurrentRoundSessionUseCase;
  let prisma: any;
  let configService: any;
  let cacheService: any;
  let computeResultUseCase: any;
  let itemRepository: any;

  beforeEach(() => {
    prisma = {
      examRound: {
        findUnique: vi.fn(),
      },
      examRoundParticipant: {
        findUnique: vi.fn(),
      },
      testSession: {
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'cat.sessionGraceSeconds') return 60;
        if (key === 'cat.boundaryMinItems') return 8;
        if (key === 'cat.maxItems') return 25;
        return undefined;
      }),
    };
    cacheService = {
      getState: vi.fn(),
      setState: vi.fn(),
      deleteState: vi.fn(),
    };
    computeResultUseCase = {
      execute: vi.fn().mockResolvedValue(undefined),
    };
    itemRepository = {
      findById: vi.fn(),
    };

    useCase = new GetCurrentRoundSessionUseCase(
      prisma,
      configService,
      cacheService,
      computeResultUseCase,
      itemRepository,
    );
  });

  it('quăng NotFoundException nếu kỳ thi không tồn tại', async () => {
    prisma.examRound.findUnique.mockResolvedValue(null);

    await expect(useCase.execute('invalid-round', 'student-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('quăng ForbiddenException nếu sinh viên không thuộc danh sách thí sinh', async () => {
    prisma.examRound.findUnique.mockResolvedValue({ id: 'round-1' });
    prisma.examRoundParticipant.findUnique.mockResolvedValue(null);

    await expect(useCase.execute('round-1', 'student-unauth')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('trả về NOT_STARTED nếu sinh viên chưa bắt đầu phiên thi nào trong kỳ này', async () => {
    prisma.examRound.findUnique.mockResolvedValue({ id: 'round-1' });
    prisma.examRoundParticipant.findUnique.mockResolvedValue({
      roundId: 'round-1',
      studentId: 'student-1',
    });
    prisma.testSession.findFirst.mockResolvedValue(null);

    const result = await useCase.execute('round-1', 'student-1');
    expect(result.status).toBe('NOT_STARTED');
  });

  it('trả về COMPLETED nếu sinh viên đã hoàn thành bài thi kỳ này', async () => {
    prisma.examRound.findUnique.mockResolvedValue({ id: 'round-1' });
    prisma.examRoundParticipant.findUnique.mockResolvedValue({
      roundId: 'round-1',
      studentId: 'student-1',
    });
    prisma.testSession.findFirst.mockResolvedValue({
      id: 'sess-completed',
      examRoundId: 'round-1',
      studentId: 'student-1',
      status: SessionStatus.COMPLETED,
      completedAt: new Date(),
      stoppingReason: StoppingReason.SE_REACHED,
    });

    const result = await useCase.execute('round-1', 'student-1');
    expect(result.status).toBe('COMPLETED');
    expect(result.sessionId).toBe('sess-completed');
    expect(result.examRoundId).toBe('round-1');
  });

  it('trả về IN_PROGRESS kèm câu hỏi hiện tại nếu phiên thi còn hạn', async () => {
    prisma.examRound.findUnique.mockResolvedValue({ id: 'round-1' });
    prisma.examRoundParticipant.findUnique.mockResolvedValue({
      roundId: 'round-1',
      studentId: 'student-1',
    });
    prisma.testSession.findFirst.mockResolvedValue({
      id: 'sess-active',
      examRoundId: 'round-1',
      studentId: 'student-1',
      status: SessionStatus.IN_PROGRESS,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // Còn 30 phút
      responses: [
        { id: 'resp-1', itemId: 'item-1', thetaAfter: -0.2, seAfter: 0.5 },
      ],
    });
    cacheService.getState.mockResolvedValue({
      state: 'WAITING_FOR_ANSWER',
      currentItemId: 'item-2',
      theta: -0.2,
      se: 0.5,
    });
    itemRepository.findById.mockResolvedValue({
      id: 'item-2',
      content: 'Choose the correct word: She ___ to school.',
      options: { A: 'go', B: 'goes', C: 'going', D: 'gone' },
      skill: 'GRAMMAR',
    });

    const result = await useCase.execute('round-1', 'student-1');
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.sessionId).toBe('sess-active');
    expect(result.currentItem?.id).toBe('item-2');
  });

  it('kích hoạt K5 Lazy Cleanup nếu phiên IN_PROGRESS quá hạn >= 8 câu', async () => {
    prisma.examRound.findUnique.mockResolvedValue({ id: 'round-1' });
    prisma.examRoundParticipant.findUnique.mockResolvedValue({
      roundId: 'round-1',
      studentId: 'student-1',
    });
    prisma.testSession.findFirst.mockResolvedValue({
      id: 'sess-expired-8',
      examRoundId: 'round-1',
      studentId: 'student-1',
      status: SessionStatus.IN_PROGRESS,
      expiresAt: new Date(Date.now() - 500000), // Đã quá hạn
      responses: Array.from({ length: 10 }, (_, i) => ({
        id: `resp-${i}`,
        thetaAfter: 0.1,
        seAfter: 0.32,
      })),
    });

    const result = await useCase.execute('round-1', 'student-1');
    expect(computeResultUseCase.execute).toHaveBeenCalled();
    expect(cacheService.deleteState).toHaveBeenCalledWith('sess-expired-8');
    expect(result.status).toBe('COMPLETED');
    expect(result.isExpired).toBe(true);
  });
});
