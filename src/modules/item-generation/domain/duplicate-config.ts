import { DEFAULT_T2_THRESHOLDS, SimilarityThresholds } from './text-similarity';

function num(value: string | undefined, fallback: number): number {
  const n = value === undefined || value === '' ? NaN : Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

/** Ngưỡng T2 đọc từ env (T2_HARD_THRESHOLD, T2_SOFT_THRESHOLD); mặc định 0.85/0.65, chờ chốt Q-7/Q-10. */
export function readT2Thresholds(
  env: NodeJS.ProcessEnv = process.env,
): SimilarityThresholds {
  const hard = num(env.T2_HARD_THRESHOLD, DEFAULT_T2_THRESHOLDS.hard);
  const soft = num(env.T2_SOFT_THRESHOLD, DEFAULT_T2_THRESHOLDS.soft);
  return soft <= hard ? { hard, soft } : DEFAULT_T2_THRESHOLDS;
}

/** Ngưỡng T3 (cosine): chỉ gắn cờ SOFT, không tự loại. Mặc định tạm 0.9. */
export const DEFAULT_T3_SOFT = 0.9;
export function readT3Soft(env: NodeJS.ProcessEnv = process.env): number {
  return num(env.T3_SOFT_THRESHOLD, DEFAULT_T3_SOFT);
}
