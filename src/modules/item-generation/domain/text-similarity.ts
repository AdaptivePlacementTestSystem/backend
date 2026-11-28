/** Độ giống văn bản cho kiểm tra trùng gần (T2) và ngữ nghĩa (T3). Hàm thuần, không phụ thuộc hạ tầng. */

export function normalizeForSimilarity(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trigrams(text: string): Set<string> {
  const padded = `  ${normalizeForSimilarity(text)} `;
  const set = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) set.add(padded.slice(i, i + 3));
  return set;
}

/** Tương đương similarity() của pg_trgm: |A∩B| / |A∪B| trên tập trigram. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

export type SimilarityLevel = 'HARD' | 'SOFT' | 'NONE';

export interface SimilarityThresholds {
  hard: number;
  soft: number;
}

/** Mặc định tạm thời, chờ chốt Q-7/Q-10; có thể ghi đè qua cấu hình. */
export const DEFAULT_T2_THRESHOLDS: SimilarityThresholds = {
  hard: 0.85,
  soft: 0.65,
};

export function classifySimilarity(
  score: number,
  t: SimilarityThresholds,
): SimilarityLevel {
  if (score >= t.hard) return 'HARD';
  if (score >= t.soft) return 'SOFT';
  return 'NONE';
}
