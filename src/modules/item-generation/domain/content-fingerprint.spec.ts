import { describe, expect, it } from 'vitest';
import { contentFingerprint } from './content-fingerprint';

describe('contentFingerprint', () => {
  const item = {
    content: 'Hello?',
    options: { A: 'one', B: 'two', C: 'three', D: 'four' },
    correctAnswer: 'A',
    explanation: 'Because.',
  };
  it('đổi khi đáp án, phương án hoặc giải thích thay đổi', () => {
    const original = contentFingerprint(item);
    expect(contentFingerprint({ ...item, correctAnswer: 'B' })).not.toBe(
      original,
    );
    expect(
      contentFingerprint({
        ...item,
        options: { ...item.options, A: 'changed' },
      }),
    ).not.toBe(original);
    expect(contentFingerprint({ ...item, explanation: 'Different' })).not.toBe(
      original,
    );
  });
  it('chuẩn hóa chữ hoa và khoảng trắng', () => {
    expect(contentFingerprint({ ...item, content: ' HELLO?  ' })).toBe(
      contentFingerprint(item),
    );
  });
});
