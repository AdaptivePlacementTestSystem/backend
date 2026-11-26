import { describe, expect, it } from 'vitest';
import { checkGeneratedBatch } from './check-generated-batch';
const item = {
  content: 'What is THIS?',
  options: { A: 'one', B: 'two', C: 'three', D: 'four' },
  correctAnswer: 'A',
  explanation: 'Because',
  skill: 'GRAMMAR',
  cefrTarget: 'A2',
  irtB: 0,
};
describe('kiểm tra cứng lô AI', () => {
  it('phát hiện trùng nội bộ dù khác khoảng trắng và chữ hoa', () => {
    const result = checkGeneratedBatch(
      [item, { ...item, content: ' what  is this? ' }],
      'GRAMMAR',
      'A2',
    );
    expect(result[0].errors).toEqual([]);
    expect(result[1].errors).toContain('DUPLICATE_IN_BATCH');
  });
  it('chặn sai đích và độ khó ngoài khoảng', () => {
    const result = checkGeneratedBatch(
      [{ ...item, skill: 'VOCABULARY', cefrTarget: 'B1', irtB: 5 }],
      'GRAMMAR',
      'A2',
    );
    expect(result[0].errors).toEqual(
      expect.arrayContaining([
        'SKILL_MISMATCH',
        'CEFR_MISMATCH',
        'IRT_B_INVALID',
      ]),
    );
  });
});
