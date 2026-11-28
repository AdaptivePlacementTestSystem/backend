import { describe, expect, it, vi } from 'vitest';
import { QuestionGridUseCase } from './question-grid.use-case';

describe('question grid upload', () => {
  it('uses normalized content identity and preserves rejected rows', async () => {
    const candidate = {
      content: '  Where   is it? ',
      options: {},
      correctAnswer: '',
      explanation: '',
      skill: '',
      cefrTarget: '',
      topicTag: '',
      irtB: 0,
    };
    const parse = {
      execute: vi.fn().mockResolvedValue({
        rows: [{ row: 2, candidate }],
        rejected: [{ row: 3, reasons: ['INVALID'] }],
      }),
    };
    const grid = {
      merge: vi.fn().mockResolvedValue(1),
      snapshot: vi.fn().mockResolvedValue(null),
      hasExpired: vi.fn().mockResolvedValue(false),
    };
    const service = new QuestionGridUseCase(
      parse as never,
      grid as never,
      {} as never,
    );
    expect(await service.upload('admin', undefined)).toMatchObject({
      added: 1,
      duplicates: 0,
      rejected: [{ row: 3 }],
    });
    const firstKey = grid.merge.mock.calls[0][1][0].rowKey;
    candidate.content = 'where is it?';
    await service.upload('admin', undefined);
    expect(grid.merge.mock.calls[1][1][0].rowKey).toBe(firstKey);
  });
});
