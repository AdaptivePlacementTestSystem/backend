import { describe, expect, it, vi } from 'vitest';
import { AdminExamRoundsUseCase } from './admin-exam-rounds.use-case';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

const dto = {
  name: ' Kỳ thi ',
  opensAt: '2026-10-24T01:00:00Z',
  closesAt: '2026-10-24T03:00:00Z',
  durationMinutes: 45,
};

describe('AdminExamRoundsUseCase', () => {
  it('creates a draft using the authenticated creator and schema fields', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'round' });
    const service = new AdminExamRoundsUseCase({
      examRound: { create },
    } as unknown as PrismaService);
    await expect(service.create(dto, 'admin')).resolves.toEqual({
      id: 'round',
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        name: 'Kỳ thi',
        opensAt: new Date(dto.opensAt),
        closesAt: new Date(dto.closesAt),
        durationMinutes: 45,
        createdById: 'admin',
      },
    });
  });
  it('rejects invalid time windows and durations longer than the window', async () => {
    const create = vi.fn();
    const service = new AdminExamRoundsUseCase({
      examRound: { create },
    } as unknown as PrismaService);
    await expect(
      service.create({ ...dto, closesAt: dto.opensAt }, 'admin'),
    ).rejects.toThrow();
    await expect(
      service.create({ ...dto, durationMinutes: 180 }, 'admin'),
    ).rejects.toThrow();
    await expect(
      service.create({ ...dto, name: '   ' }, 'admin'),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it('returns real participant counts and derives effective status', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T02:00:00Z'));
    try {
      const findMany = vi.fn().mockResolvedValue([
        {
          id: '1',
          status: 'SCHEDULED',
          opensAt: new Date(dto.opensAt),
          closesAt: new Date(dto.closesAt),
          _count: { participants: 3 },
        },
        {
          id: '2',
          status: 'DRAFT',
          opensAt: new Date(dto.opensAt),
          closesAt: new Date(dto.closesAt),
          _count: { participants: 0 },
        },
      ]);
      const service = new AdminExamRoundsUseCase({
        examRound: { findMany },
      } as unknown as PrismaService);
      expect(await service.list()).toMatchObject([
        { effectiveStatus: 'OPEN', participantCount: 3 },
        { effectiveStatus: 'DRAFT', participantCount: 0 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
  it('marks a scheduled round closed at the exact closing instant', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(dto.closesAt));
    try {
      const findMany = vi.fn().mockResolvedValue([
        {
          id: '1',
          status: 'SCHEDULED',
          opensAt: new Date(dto.opensAt),
          closesAt: new Date(dto.closesAt),
          _count: { participants: 1 },
        },
      ]);
      const service = new AdminExamRoundsUseCase({
        examRound: { findMany },
      } as unknown as PrismaService);
      expect(await service.list()).toMatchObject([
        { effectiveStatus: 'CLOSED' },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
