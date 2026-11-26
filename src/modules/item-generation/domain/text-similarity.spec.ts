import { describe, expect, it } from 'vitest';
import {
  classifySimilarity,
  cosineSimilarity,
  DEFAULT_T2_THRESHOLDS,
  trigramSimilarity,
} from './text-similarity';

describe('text-similarity', () => {
  it('giống hệt cho điểm 1, khác hẳn cho điểm thấp', () => {
    expect(trigramSimilarity('She goes to school.', 'she goes to school')).toBe(1);
    expect(trigramSimilarity('She goes to school', 'Quantum physics lecture')).toBeLessThan(0.2);
  });

  it('chuỗi rỗng không gây chia cho 0', () => {
    expect(trigramSimilarity('', 'abc')).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('cosine của vector song song bằng 1', () => {
    expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1);
  });

  it('phân loại theo ngưỡng', () => {
    expect(classifySimilarity(0.9, DEFAULT_T2_THRESHOLDS)).toBe('HARD');
    expect(classifySimilarity(0.7, DEFAULT_T2_THRESHOLDS)).toBe('SOFT');
    expect(classifySimilarity(0.3, DEFAULT_T2_THRESHOLDS)).toBe('NONE');
  });
});
