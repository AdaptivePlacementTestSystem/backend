import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionCleanupService } from './session-cleanup.service';
import {
  SessionStatus,
  StoppingReason,
} from '../../domain/entities/test-session.entity';

describe('SessionCleanupService', () => {
  let service: SessionCleanupService;
  let prisma: any;
  let configService: any;
  let cacheService: any;
  let computeResultUseCase: any;

  beforeEach(() => {
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
    cacheService = {
      deleteState: vi.fn().mockResolvedValue(undefined),
    };
    computeResultUseCase = {
      execute: vi.fn().mockResolvedValue(undefined),
    };

    service = new SessionCleanupService(
      prisma,
      configService,
      cacheService,
      computeResultUseCase,
    );
  });

  it('trả về isExpired: false nếu phiên không phải IN_PROGRESS', async () => {
    const res = await service.cleanupIfExpired({
      id: 'session-1',
      status: SessionStatus.COMPLETED,
      expiresAt: new Date(Date.now() - 100000),
      responses: [],
    });

    expect(res.isExpired).toBe(false);
    expect(computeResultUseCase.execute).not.toHaveBeenCalled();
    expect(prisma.testSession.update).not.toHaveBeenCalled();
  });

  it('trả về isExpired: false nếu phiên IN_PROGRESS và còn trong thời hạn', async () => {
    const res = await service.cleanupIfExpired({
      id: 'session-1',
      status: SessionStatus.IN_PROGRESS,
      expiresAt: new Date(Date.now() + 1000 * 60 * 20), // còn 20 phút
      responses: [],
    });

    expect(res.isExpired).toBe(false);
    expect(computeResultUseCase.execute).not.toHaveBeenCalled();
  });

  it('khi quá hạn và đã làm >= 8 câu (đủ boundaryMinItems): tính kết quả COMPLETED với TIMEOUT', async () => {
    const responses = Array.from({ length: 9 }, (_, i) => ({
      thetaAfter: 0.25,
      seAfter: 0.33,
    }));

    const res = await service.cleanupIfExpired({
      id: 'session-1',
      status: SessionStatus.IN_PROGRESS,
      expiresAt: new Date(Date.now() - 1000 * 120), // quá hạn 2 phút (đã vượt grace 60s)
      responses,
    });

    expect(res.isExpired).toBe(true);
    expect(res.status).toBe(SessionStatus.COMPLETED);
    expect(res.stoppingReason).toBe(StoppingReason.TIMEOUT);
    expect(computeResultUseCase.execute).toHaveBeenCalledWith(
      'session-1',
      0.25,
      0.33,
      StoppingReason.TIMEOUT,
    );
    expect(cacheService.deleteState).toHaveBeenCalledWith('session-1');
  });

  it('khi quá hạn và đã làm < 8 câu: cập nhật ABANDONED với TIMEOUT và xóa cache', async () => {
    const responses = Array.from({ length: 3 }, (_, i) => ({
      thetaAfter: -0.1,
      seAfter: 0.65,
    }));

    const res = await service.cleanupIfExpired({
      id: 'session-2',
      status: SessionStatus.IN_PROGRESS,
      expiresAt: new Date(Date.now() - 1000 * 120),
      responses,
    });

    expect(res.isExpired).toBe(true);
    expect(res.status).toBe(SessionStatus.ABANDONED);
    expect(res.stoppingReason).toBe(StoppingReason.TIMEOUT);
    expect(prisma.testSession.update).toHaveBeenCalledWith({
      where: { id: 'session-2' },
      data: expect.objectContaining({
        status: SessionStatus.ABANDONED,
        stoppingReason: StoppingReason.TIMEOUT,
      }),
    });
    expect(computeResultUseCase.execute).not.toHaveBeenCalled();
    expect(cacheService.deleteState).toHaveBeenCalledWith('session-2');
  });
});
