import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResumeSessionUseCase } from './resume-session.use-case';
import { NotFoundException } from '@nestjs/common';
import {
  SessionStatus,
  StoppingReason,
} from '../../domain/entities/test-session.entity';

describe('ResumeSessionUseCase', () => {
  let useCase: ResumeSessionUseCase;
  let sessionRepository: any;
  let cacheService: any;
  let prisma: any;
  let configService: any;
  let computeResultUseCase: any;
  let itemRepository: any;

  beforeEach(() => {
    sessionRepository = {
      findById: vi.fn(),
    };
    cacheService = {
      getState: vi.fn(),
      setState: vi.fn(),
      deleteState: vi.fn(),
    };
    prisma = {
      testSession: {
        update: vi.fn().mockResolvedValue({}),
      },
    };
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'cat.sessionGraceSeconds') return 60;
        if (key === 'cat.boundaryMinItems') return 8;
        return undefined;
      }),
    };
    computeResultUseCase = {
      execute: vi.fn().mockResolvedValue(undefined),
    };
    itemRepository = {
      findById: vi.fn(),
    };

    useCase = new ResumeSessionUseCase(
      sessionRepository,
      cacheService,
      prisma,
      configService,
      computeResultUseCase,
      itemRepository,
    );
  });

  it('quăng NotFoundException nếu không tìm thấy phiên', async () => {
    sessionRepository.findById.mockResolvedValue(null);
    await expect(useCase.execute('invalid-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('trả về câu hỏi hiện tại và trạng thái nếu phiên còn trong thời hạn', async () => {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 20); // 20 mins later
    sessionRepository.findById.mockResolvedValue({
      id: 's-1',
      status: SessionStatus.IN_PROGRESS,
      expiresAt,
      responses: [{ itemId: 'item-1', thetaAfter: -0.2, seAfter: 0.45 }],
    });
    cacheService.getState.mockResolvedValue({
      state: 'WAITING_FOR_ANSWER',
      currentItemId: 'item-2',
      theta: -0.2,
      se: 0.45,
    });
    itemRepository.findById.mockResolvedValue({
      id: 'item-2',
      content: 'Question 2',
    });

    const result = await useCase.execute('s-1');
    expect(result.currentItem?.id).toBe('item-2');
    expect(result.state.state).toBe('WAITING_FOR_ANSWER');
    expect(result.isExpired).toBeUndefined();
  });

  it('xử lý Lazy Cleanup quy tắc K5: hết hạn và >= 8 câu -> COMPLETED với TIMEOUT', async () => {
    const expiresAt = new Date(Date.now() - 1000 * 120); // expired 2 mins ago
    const responses = Array.from({ length: 9 }, (_, i) => ({
      itemId: `item-${i + 1}`,
      thetaAfter: 0.1,
      seAfter: 0.32,
    }));

    sessionRepository.findById.mockResolvedValue({
      id: 's-expired-completed',
      status: SessionStatus.IN_PROGRESS,
      expiresAt,
      responses,
    });

    const result = await useCase.execute('s-expired-completed');
    expect(computeResultUseCase.execute).toHaveBeenCalledWith(
      's-expired-completed',
      0.1,
      0.32,
      StoppingReason.TIMEOUT,
    );
    expect(cacheService.deleteState).toHaveBeenCalledWith(
      's-expired-completed',
    );
    expect(result.isExpired).toBe(true);
    expect(result.state.state).toBe('COMPLETED');
    expect(result.state.stoppingReason).toBe(StoppingReason.TIMEOUT);
  });

  it('xử lý Lazy Cleanup quy tắc K5: hết hạn và < 8 câu -> ABANDONED với TIMEOUT', async () => {
    const expiresAt = new Date(Date.now() - 1000 * 120); // expired 2 mins ago
    const responses = Array.from({ length: 4 }, (_, i) => ({
      itemId: `item-${i + 1}`,
      thetaAfter: -0.5,
      seAfter: 0.6,
    }));

    sessionRepository.findById.mockResolvedValue({
      id: 's-expired-abandoned',
      status: SessionStatus.IN_PROGRESS,
      expiresAt,
      responses,
    });

    const result = await useCase.execute('s-expired-abandoned');
    expect(prisma.testSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's-expired-abandoned' },
        data: expect.objectContaining({
          status: SessionStatus.ABANDONED,
          stoppingReason: StoppingReason.TIMEOUT,
        }),
      }),
    );
    expect(cacheService.deleteState).toHaveBeenCalledWith(
      's-expired-abandoned',
    );
    expect(result.isExpired).toBe(true);
    expect(result.state.state).toBe('ABANDONED');
  });
});
