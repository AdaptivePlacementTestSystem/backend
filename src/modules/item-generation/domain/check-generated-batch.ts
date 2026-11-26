import { createHash } from 'crypto';
import { validateCandidate } from './candidate-validation';

/** Kiểm tra cứng và trùng chính xác trong danh sách; chưa thay thế T2, T3 và G5. */
export function checkGeneratedBatch(
  candidates: unknown[],
  skill: string,
  cefrTarget: string,
) {
  const seen = new Set<string>();
  return candidates.map((candidate, index) => {
    const errors = validateCandidate(candidate);
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      return { index, errors };
    const value = candidate as Record<string, unknown>;
    if (value.skill !== skill) errors.push('SKILL_MISMATCH');
    if (value.cefrTarget !== cefrTarget) errors.push('CEFR_MISMATCH');
    if (
      typeof value.irtB !== 'number' ||
      !Number.isFinite(value.irtB) ||
      value.irtB < -4 ||
      value.irtB > 4
    )
      errors.push('IRT_B_INVALID');
    if (typeof value.content === 'string') {
      const normalized = value.content
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('en');
      const hash = createHash('sha256').update(normalized).digest('hex');
      if (seen.has(hash)) errors.push('DUPLICATE_IN_BATCH');
      seen.add(hash);
    }
    return { index, errors };
  });
}
