import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListExamRoundsUseCase } from './list-exam-rounds.use-case';

describe('ListExamRoundsUseCase', () => {
  let useCase: ListExamRoundsUseCase;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      examRound: {
        findMany: vi.fn(),
      },
    };
    useCase = new ListExamRoundsUseCase(prisma);
  });

  it('trả về danh sách kỳ thi với effectiveStatus và số lượng người tham gia', async () => {
    const past = new Date(Date.now() - 3600000);
    const future = new Date(Date.now() + 3600000);

    prisma.examRound.findMany.mockResolvedValue([
      {
        id: 'round-1',
        name: 'Kỳ thi K2026',
        status: 'OPEN',
        opensAt: past,
        closesAt: future,
        durationMinutes: 45,
        createdAt: past,
        _count: {
          participants: 120,
          sessions: 85,
        },
      },
    ]);

    const result = await useCase.execute();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('round-1');
    expect(result[0].name).toBe('Kỳ thi K2026');
    expect(result[0].participantCount).toBe(120);
    expect(result[0].sessionCount).toBe(85);
  });
});
