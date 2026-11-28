import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import {
  BATCH_STATUSES_NEEDING_ACTION,
  GetSystemOverviewUseCase,
} from './get-system-overview.use-case';

const NOW = new Date('2026-11-14T10:00:00Z');

const openRound = (overrides: Record<string, unknown> = {}) => ({
  id: 'r-1',
  name: 'Kỳ thi 1',
  status: 'OPEN',
  opensAt: new Date('2026-11-14T08:00:00Z'),
  closesAt: new Date('2026-11-14T17:00:00Z'),
  durationMinutes: 45,
  _count: { participants: 10 },
  sessions: [] as { studentId: string; status: string }[],
  ...overrides,
});

describe('GetSystemOverviewUseCase', () => {
  let useCase: GetSystemOverviewUseCase;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      examRound: {
        findUnique: vi.fn().mockResolvedValue({ id: 'r-1' }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      testSession: { groupBy: vi.fn().mockResolvedValue([]) },
      languageProfile: { findMany: vi.fn().mockResolvedValue([]) },
      item: { groupBy: vi.fn().mockResolvedValue([]) },
      itemBatch: { count: vi.fn().mockResolvedValue(0) },
    };
    useCase = new GetSystemOverviewUseCase(prisma);
  });

  it('hệ thống rỗng: mọi số bằng 0, đủ 6 mức CEFR và 6 trạng thái câu', async () => {
    const result = await useCase.execute(undefined, NOW);

    expect(result.studentsCompleted).toBe(0);
    expect(result.finalApprovedItems).toBe(0);
    expect(result.batchesNeedingAction).toBe(0);
    expect(result.openExamRounds).toBe(0);
    expect(result.openRounds).toEqual([]);
    expect(result.cefrDistribution).toEqual({
      PRE_A1: 0,
      A1: 0,
      A2: 0,
      B1: 0,
      B2: 0,
      C1_PLUS: 0,
    });
    expect(Object.keys(result.itemStatusCounts).sort()).toEqual(
      [
        'AI_REJECTED',
        'DRAFT',
        'FINAL_APPROVED',
        'FIRST_APPROVED',
        'REJECTED',
        'SECOND_APPROVED',
      ].sort(),
    );
    expect(result.examRoundId).toBeNull();
    expect(result.generatedAt).toBe(NOW);
  });

  it('SV đã thi: đếm SV khác nhau có phiên COMPLETED (không tính ABANDONED/IN_PROGRESS)', async () => {
    prisma.testSession.groupBy.mockResolvedValue([
      { studentId: 's1' },
      { studentId: 's2' },
    ]);

    const result = await useCase.execute(undefined, NOW);

    expect(result.studentsCompleted).toBe(2);
    expect(prisma.testSession.groupBy).toHaveBeenCalledWith({
      by: ['studentId'],
      where: { status: 'COMPLETED' },
    });
  });

  it('phân phối CEFR: lấy hồ sơ mới nhất mỗi SV (distinct studentId, mới nhất trước)', async () => {
    prisma.languageProfile.findMany.mockResolvedValue([
      { cefrLevel: 'B1' },
      { cefrLevel: 'B1' },
      { cefrLevel: 'C1_PLUS' },
      { cefrLevel: 'PRE_A1' },
    ]);

    const result = await useCase.execute(undefined, NOW);

    expect(result.cefrDistribution).toEqual({
      PRE_A1: 1,
      A1: 0,
      A2: 0,
      B1: 2,
      B2: 0,
      C1_PLUS: 1,
    });
    expect(prisma.languageProfile.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { completedAt: 'desc' },
      distinct: ['studentId'],
      select: { cefrLevel: true },
    });
  });

  it('thống kê trạng thái câu; câu vào ngân hàng = FINAL_APPROVED', async () => {
    prisma.item.groupBy.mockResolvedValue([
      { status: 'FINAL_APPROVED', _count: { _all: 486 } },
      { status: 'DRAFT', _count: { _all: 45 } },
      { status: 'AI_REJECTED', _count: { _all: 24 } },
    ]);

    const result = await useCase.execute(undefined, NOW);

    expect(result.finalApprovedItems).toBe(486);
    expect(result.itemStatusCounts).toMatchObject({
      FINAL_APPROVED: 486,
      DRAFT: 45,
      AI_REJECTED: 24,
      FIRST_APPROVED: 0,
      SECOND_APPROVED: 0,
      REJECTED: 0,
    });
  });

  it('lô cần xử lý: chỉ READY_TO_ASSIGN, READY_TO_FINALIZE, FAILED, PARTIAL, PARTIALLY_IMPORTED (không có IN_REVIEW)', async () => {
    prisma.itemBatch.count.mockResolvedValue(3);

    const result = await useCase.execute(undefined, NOW);

    expect(result.batchesNeedingAction).toBe(3);
    expect(prisma.itemBatch.count).toHaveBeenCalledWith({
      where: { status: { in: [...BATCH_STATUSES_NEEDING_ACTION] } },
    });
    expect([...BATCH_STATUSES_NEEDING_ACTION].sort()).toEqual([
      'FAILED',
      'PARTIAL',
      'PARTIALLY_IMPORTED',
      'READY_TO_ASSIGN',
      'READY_TO_FINALIZE',
    ]);
  });

  describe('lọc theo kỳ thi (BR-13)', () => {
    it('chỉ áp cho SV đã thi và phân phối CEFR, các số còn lại vẫn toàn hệ thống', async () => {
      await useCase.execute('r-1', NOW);

      expect(prisma.testSession.groupBy).toHaveBeenCalledWith({
        by: ['studentId'],
        where: { status: 'COMPLETED', examRoundId: 'r-1' },
      });
      expect(prisma.languageProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { testSession: { examRoundId: 'r-1' } },
        }),
      );
      // câu hỏi và lô không nhận examRoundId
      expect(prisma.item.groupBy).toHaveBeenCalledWith({
        by: ['status'],
        _count: { _all: true },
      });
      expect(prisma.itemBatch.count.mock.calls[0][0].where).not.toHaveProperty(
        'examRoundId',
      );
    });

    it('trả examRoundId trong kết quả', async () => {
      const result = await useCase.execute('r-1', NOW);
      expect(result.examRoundId).toBe('r-1');
    });

    it('kỳ thi không tồn tại: 404 và không truy vấn tiếp', async () => {
      prisma.examRound.findUnique.mockResolvedValue(null);

      await expect(useCase.execute('missing', NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.testSession.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('bảng kỳ thi đang mở', () => {
    it('chỉ lấy kỳ SCHEDULED/OPEN đang trong khung giờ', async () => {
      await useCase.execute(undefined, NOW);

      const where = prisma.examRound.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ in: ['SCHEDULED', 'OPEN'] });
      expect(where.opensAt).toEqual({ lte: NOW });
      expect(where.closesAt).toEqual({ gt: NOW });
    });

    it('chuyển lazy: kỳ cột status = SCHEDULED nhưng đã qua giờ mở vẫn tính là đang mở', async () => {
      prisma.examRound.findMany.mockResolvedValue([
        openRound({ status: 'SCHEDULED' }),
      ]);

      const result = await useCase.execute(undefined, NOW);

      expect(result.openExamRounds).toBe(1);
    });

    it('loại kỳ có effectiveStatus khác OPEN (đã quá giờ đóng dù cột status còn OPEN)', async () => {
      prisma.examRound.findMany.mockResolvedValue([
        openRound({ closesAt: new Date('2026-11-14T09:00:00Z') }),
      ]);

      const result = await useCase.execute(undefined, NOW);

      expect(result.openExamRounds).toBe(0);
      expect(result.openRounds).toEqual([]);
    });

    it('đếm chưa thi / đang thi / hoàn thành theo SV, cộng lại bằng số SV của kỳ', async () => {
      prisma.examRound.findMany.mockResolvedValue([
        openRound({
          _count: { participants: 10 },
          sessions: [
            { studentId: 's1', status: 'COMPLETED' },
            { studentId: 's2', status: 'COMPLETED' },
            { studentId: 's3', status: 'IN_PROGRESS' },
            { studentId: 's4', status: 'ABANDONED' }, // bỏ dở: được thi lại, vẫn là chưa thi
          ],
        }),
      ]);

      const [round] = (await useCase.execute(undefined, NOW)).openRounds;

      expect(round).toMatchObject({
        id: 'r-1',
        participantCount: 10,
        completed: 2,
        inProgress: 1,
        notStarted: 7,
        durationMinutes: 45,
      });
      expect(round.completed + round.inProgress + round.notStarted).toBe(10);
    });

    it('SV vừa có phiên IN_PROGRESS vừa có COMPLETED chỉ tính là hoàn thành', async () => {
      prisma.examRound.findMany.mockResolvedValue([
        openRound({
          _count: { participants: 2 },
          sessions: [
            { studentId: 's1', status: 'ABANDONED' },
            { studentId: 's1', status: 'COMPLETED' },
            { studentId: 's1', status: 'IN_PROGRESS' },
          ],
        }),
      ]);

      const [round] = (await useCase.execute(undefined, NOW)).openRounds;

      expect(round.completed).toBe(1);
      expect(round.inProgress).toBe(0);
      expect(round.notStarted).toBe(1);
    });
  });
});
