import { describe, expect, it } from 'vitest';
import { validateCandidate } from './candidate-validation';

const valid = {
  content: 'She ____ to work every day.',
  options: { A: 'goes', B: 'go', C: 'going', D: 'gone' },
  correctAnswer: 'A',
  explanation: 'The singular subject takes goes.',
  skill: 'GRAMMAR',
  cefrTarget: 'B1',
};

describe('validateCandidate', () => {
  it('chấp nhận hình thức đủ trường', () => {
    expect(validateCandidate(valid)).toEqual([]);
  });

  it('từ chối dữ liệu không phải object', () => {
    expect(validateCandidate(null)).toContain('CANDIDATE_INVALID');
    expect(validateCandidate([])).toContain('CANDIDATE_INVALID');
  });

  it('phát hiện nội dung, giải thích và đáp án sai', () => {
    expect(
      validateCandidate({
        ...valid,
        content: ' ',
        explanation: '',
        correctAnswer: 'E',
      }),
    ).toEqual(['CONTENT_REQUIRED', 'EXPLANATION_REQUIRED', 'ANSWER_INVALID']);
  });

  it('từ chối thiếu, thừa hoặc rỗng lựa chọn', () => {
    expect(
      validateCandidate({ ...valid, options: { A: 'a', B: 'b', C: 'c' } }),
    ).toContain('OPTIONS_INVALID');
    expect(
      validateCandidate({
        ...valid,
        options: { ...valid.options, E: 'extra' },
      }),
    ).toContain('OPTIONS_INVALID');
    expect(
      validateCandidate({ ...valid, options: { ...valid.options, D: ' ' } }),
    ).toContain('OPTIONS_INVALID');
  });

  it('phát hiện lựa chọn trùng sau khi bỏ khoảng trắng và không phân biệt hoa thường', () => {
    expect(
      validateCandidate({
        ...valid,
        options: { ...valid.options, B: ' GOES ' },
      }),
    ).toContain('OPTIONS_DUPLICATE');
  });

  it('từ chối skill, CEFR và chủ đề không hợp lệ', () => {
    expect(
      validateCandidate({
        ...valid,
        skill: 'WRITING',
        cefrTarget: 'B3',
        topicTag: 'x'.repeat(51),
      }),
    ).toEqual(['SKILL_INVALID', 'CEFR_INVALID', 'TOPIC_INVALID']);
  });
});
