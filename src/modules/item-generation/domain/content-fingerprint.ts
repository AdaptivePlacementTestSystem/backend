import { createHash } from 'crypto';

/** Băm nội dung liên quan đến kết quả kiểm tra; chuẩn hóa theo thứ tự cố định. */
export function contentFingerprint(input: {
  content: string;
  options: Record<string, string>;
  correctAnswer: string;
  explanation: string;
}): string {
  const normalize = (value: string) =>
    value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  return createHash('sha256')
    .update(
      JSON.stringify({
        content: normalize(input.content),
        options: ['A', 'B', 'C', 'D'].map((key) =>
          normalize(input.options[key]),
        ),
        correctAnswer: normalize(input.correctAnswer),
        explanation: normalize(input.explanation),
      }),
    )
    .digest('hex');
}
