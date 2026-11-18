import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetStudentHistoryUseCase } from './get-student-history.use-case';

describe('GetStudentHistoryUseCase', () => {
  let useCase: GetStudentHistoryUseCase;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      testSession: {
        findMany: vi.fn(),
      },
    };
    useCase = new GetStudentHistoryUseCase(prisma);
  });

  it('trả về danh sách lịch sử thi của sinh viên theo thứ tự mới nhất', async () => {
    prisma.testSession.findMany.mockResolvedValue([
      {
        id: 'sess-1',
        examRoundId: 'round-1',
        round: { name: 'Kỳ thi phân loại đầu khóa' },
        startedAt: new Date('2026-11-10T10:00:00Z'),
        completedAt: new Date('2026-11-10T10:35:00Z'),
        responses: [{}, {}, {}],
        languageProfile: { cefrLevel: 'B1' },
        thetaFinal: 0.42,
        seFinal: 0.33,
        status: 'COMPLETED',
        stoppingReason: 'SE_REACHED',
      },
      {
        id: 'sess-2',
        examRoundId: 'round-2',
        round: { name: 'Kỳ thi thử nghiệm' },
        startedAt: new Date('2026-11-01T09:00:00Z'),
        completedAt: new Date('2026-11-01T09:15:00Z'),
        responses: [{}],
        languageProfile: null,
        thetaFinal: null,
        seFinal: null,
        status: 'ABANDONED',
        stoppingReason: 'TIMEOUT',
      },
    ]);

    const result = await useCase.execute('student-1');

    expect(result).toHaveLength(2);
    expect(result[0].sessionId).toBe('sess-1');
    expect(result[0].examRoundTitle).toBe('Kỳ thi phân loại đầu khóa');
    expect(result[0].cefrLevel).toBe('B1');
    expect(result[0].itemsAdministered).toBe(3);

    expect(result[1].sessionId).toBe('sess-2');
    expect(result[1].status).toBe('ABANDONED');
    expect(result[1].cefrLevel).toBeNull();
  });
});
