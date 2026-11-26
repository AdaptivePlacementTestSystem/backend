import { validateCandidate } from '../domain/candidate-validation';

export interface CandidateCheck {
  index: number;
  errors: string[];
}

/** Chỉ phân loại hình thức; không thay thế kiểm tra AI và giảng viên. */
export function validateGeneratedCandidates(
  raw: string,
  maxCandidates: number,
): CandidateCheck[] {
  if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 1) {
    throw new Error('CANDIDATE_LIMIT_INVALID');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('GENERATED_JSON_INVALID');
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.length > maxCandidates
  ) {
    throw new Error('GENERATED_LIST_INVALID');
  }
  return parsed.map((item: unknown, index: number) => ({
    index,
    errors: validateCandidate(item),
  }));
}
