import { createHash } from 'node:crypto';

type PreviewItem = {
  id: string;
  skill: string;
  cefrTarget: string;
  createdAt: Date;
};
const CEFR = ['PRE_A1', 'A1', 'A2', 'B1', 'B2', 'C1_PLUS'];
export function orderedAssignmentItems(items: PreviewItem[]): PreviewItem[] {
  return [...items].sort(
    (a, b) =>
      a.skill.localeCompare(b.skill, 'en') ||
      CEFR.indexOf(a.cefrTarget) - CEFR.indexOf(b.cefrTarget) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id, 'en'),
  );
}
export function assignmentRevision(
  status: string,
  items: PreviewItem[],
): string {
  const normalized = orderedAssignmentItems(items).map((item) => [
    item.id,
    item.skill,
    item.cefrTarget,
    item.createdAt.toISOString(),
  ]);
  return createHash('sha256')
    .update(
      JSON.stringify({
        algorithm: 'round-robin-v1',
        status,
        items: normalized,
      }),
    )
    .digest('hex');
}
