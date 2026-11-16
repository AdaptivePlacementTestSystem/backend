import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetStudentExamRoundsUseCase } from './get-student-exam-rounds.use-case';

describe('GetStudentExamRoundsUseCase', () => {
  let useCase: GetStudentExamRoundsUseCase;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      examRoundParticipant: {
        findMany: vi.fn(),
      },
    };
    useCase = new GetStudentExamRoundsUseCase(prisma);
  });

  it('trả về danh sách kỳ thi được gán và trạng thái phiên tương ứng', async () => {
    const now = new Date();
    const opensAt = new Date(now.getTime() - 1000 * 60 * 60);
    const closesAt = new Date(now.getTime() + 1000 * 60 * 60 * 24);

    prisma.examRoundParticipant.findMany.mockResolvedValue([
      {
        roundId: 'round-1',
        studentId: 'student-1',
        round: {
          id: 'round-1',
          name: 'Kỳ thi phân lớp đợt 1',
          opensAt,
          closesAt,
          durationMinutes: 45,
          status: 'OPEN',
        },
        sessions: [
          {
            id: 'session-101',
            status: 'COMPLETED',
            languageProfile: { cefrLevel: 'B2' },
          },
        ],
      },
      {
        roundId: 'round-2',
        studentId: 'student-1',
        round: {
          id: 'round-2',
          name: 'Kỳ thi kiểm tra đột xuất',
          opensAt,
          closesAt,
          durationMinutes: 45,
          status: 'OPEN',
        },
        sessions: [],
      },
    ]);

    const result = await useCase.execute('student-1');

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Kỳ thi phân lớp đợt 1');
    expect(result[0].sessionStatus).toBe('COMPLETED');
    expect(result[0].scoreCefr).toBe('B2');
    expect(result[0].effectiveStatus).toBe('OPEN');

    expect(result[1].sessionStatus).toBe('NOT_STARTED');
    expect(result[1].sessionId).toBeUndefined();
  });
});
