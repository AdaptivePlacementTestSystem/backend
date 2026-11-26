import { CEFRLevel, Skill } from '@apt/shared-types';

/** Kiểm tra hình thức, không chứng nhận chất lượng hay đáp án duy nhất. */
export function validateCandidate(candidate: unknown): string[] {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return ['CANDIDATE_INVALID'];
  }

  const value = candidate as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof value.content !== 'string' || !value.content.trim()) {
    errors.push('CONTENT_REQUIRED');
  }
  if (typeof value.explanation !== 'string' || !value.explanation.trim()) {
    errors.push('EXPLANATION_REQUIRED');
  }

  const options = value.options;
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    errors.push('OPTIONS_INVALID');
  } else {
    const entries = options as Record<string, unknown>;
    const keys = ['A', 'B', 'C', 'D'];
    if (
      Object.keys(entries).length !== keys.length ||
      keys.some(
        (key) =>
          typeof entries[key] !== 'string' || !(entries[key] as string).trim(),
      )
    ) {
      errors.push('OPTIONS_INVALID');
    } else {
      const normalized = keys.map((key) =>
        (entries[key] as string).trim().toLowerCase(),
      );
      if (new Set(normalized).size !== keys.length)
        errors.push('OPTIONS_DUPLICATE');
    }
  }

  if (
    typeof value.correctAnswer !== 'string' ||
    !['A', 'B', 'C', 'D'].includes(value.correctAnswer)
  ) {
    errors.push('ANSWER_INVALID');
  }
  if (
    typeof value.skill !== 'string' ||
    !Object.values<string>(Skill).includes(value.skill)
  ) {
    errors.push('SKILL_INVALID');
  }
  if (
    typeof value.cefrTarget !== 'string' ||
    !Object.values<string>(CEFRLevel).includes(value.cefrTarget)
  ) {
    errors.push('CEFR_INVALID');
  }
  if (
    value.topicTag != null &&
    (typeof value.topicTag !== 'string' || value.topicTag.length > 50)
  ) {
    errors.push('TOPIC_INVALID');
  }
  return errors;
}
