import { describe, expect, it } from 'vitest';
import { validateGeneratedCandidates } from './validate-generated-candidates';

describe('validateGeneratedCandidates', () => {
  it('giữ vị trí từng câu và trả lỗi riêng cho câu sai', () => {
    const valid = {
      content: 'Question',
      options: { A: 'one', B: 'two', C: 'three', D: 'four' },
      correctAnswer: 'A',
      explanation: 'Explanation',
      skill: 'VOCABULARY',
      cefrTarget: 'B1',
    };
    expect(
      validateGeneratedCandidates(
        JSON.stringify([valid, { ...valid, correctAnswer: 'E' }]),
        2,
      ),
    ).toEqual([
      { index: 0, errors: [] },
      { index: 1, errors: ['ANSWER_INVALID'] },
    ]);
  });

  it('từ chối JSON lỗi, danh sách rỗng và vượt giới hạn', () => {
    expect(() => validateGeneratedCandidates('{', 1)).toThrow(
      'GENERATED_JSON_INVALID',
    );
    expect(() => validateGeneratedCandidates('{}', 1)).toThrow(
      'GENERATED_LIST_INVALID',
    );
    expect(() => validateGeneratedCandidates('[]', 1)).toThrow(
      'GENERATED_LIST_INVALID',
    );
    expect(() => validateGeneratedCandidates('[{},{}]', 1)).toThrow(
      'GENERATED_LIST_INVALID',
    );
    expect(() => validateGeneratedCandidates('[]', 0)).toThrow(
      'CANDIDATE_LIMIT_INVALID',
    );
  });
});
