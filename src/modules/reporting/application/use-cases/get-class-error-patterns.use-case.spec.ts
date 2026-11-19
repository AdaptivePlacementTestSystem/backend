import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetClassErrorPatternsUseCase } from './get-class-error-patterns.use-case';
import { NotFoundException } from '@nestjs/common';

describe('GetClassErrorPatternsUseCase', () => {
  let useCase: GetClassErrorPatternsUseCase;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      examRound: {
        findUnique: vi.fn(),
      },
      languageProfile: {
        findMany: vi.fn(),
      },
    };
    useCase = new GetClassErrorPatternsUseCase(prisma);
  });

  it('tổng hợp chính xác các error pattern từ profiles và tính đúng errorRate', async () => {
    prisma.languageProfile.findMany.mockResolvedValue([
      {
        errorPatterns: [
          {
            topicTag: 'past_simple',
            skill: 'GRAMMAR',
            itemsAttempted: 4,
            itemsIncorrect: 3,
          },
          {
            topicTag: 'collocation',
            skill: 'VOCABULARY',
            itemsAttempted: 2,
            itemsIncorrect: 1,
          },
        ],
      },
      {
        errorPatterns: [
          {
            topicTag: 'past_simple',
            skill: 'GRAMMAR',
            itemsAttempted: 2,
            itemsIncorrect: 2,
          },
        ],
      },
    ]);

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    // past_simple: studentCount=2, attempted=6, incorrect=5 -> rate = 5/6 = 83%
    const pastSimple = result.find((x) => x.topicTag === 'past_simple');
    expect(pastSimple).toBeDefined();
    expect(pastSimple?.studentCount).toBe(2);
    expect(pastSimple?.errorRate).toBe(83);

    // collocation: studentCount=1, attempted=2, incorrect=1 -> rate = 1/2 = 50%
    const collocation = result.find((x) => x.topicTag === 'collocation');
    expect(collocation).toBeDefined();
    expect(collocation?.studentCount).toBe(1);
    expect(collocation?.errorRate).toBe(50);

    // Sắp xếp: past_simple (83%) đứng trước collocation (50%)
    expect(result[0].topicTag).toBe('past_simple');
  });

  it('lọc theo examRoundId: kiểm tra kỳ thi và ném 404 nếu không tìm thấy', async () => {
    prisma.examRound.findUnique.mockResolvedValue(null);

    await expect(useCase.execute('invalid-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('không có lỗi nào: trả về mảng rỗng', async () => {
    prisma.languageProfile.findMany.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
