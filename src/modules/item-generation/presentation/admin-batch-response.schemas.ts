import type { SchemaObject } from '@nestjs/swagger';

const str: SchemaObject = { type: 'string' };
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const date: SchemaObject = { type: 'string', format: 'date-time' };
const num: SchemaObject = { type: 'integer' };
const bool: SchemaObject = { type: 'boolean' };
const nullable = (s: SchemaObject): SchemaObject => ({ ...s, nullable: true });
const arr = (s: SchemaObject): SchemaObject => ({ type: 'array', items: s });
const obj = (
  properties: Record<string, SchemaObject>,
  optional: string[] = [],
): SchemaObject => ({
  type: 'object',
  properties,
  required: Object.keys(properties).filter((key) => !optional.includes(key)),
});
const person = obj({ id: uuid, fullName: str });
const options: SchemaObject = {
  type: 'object',
  additionalProperties: { type: 'string' },
};
const candidate = obj({
  content: str,
  options,
  correctAnswer: str,
  explanation: str,
  skill: str,
  cefrTarget: str,
  topicTag: str,
  irtB: { type: 'number' },
});
const rejected = obj({ row: num, reasons: arr(str) });
const gridRow = obj({ rowKey: str, candidate });
const job = obj({
  kind: str,
  status: str,
  attempts: num,
  lastError: nullable(str),
});
const check = obj({
  checkpoint: str,
  level: str,
  reasonCodes: arr(str),
  checkedAt: date,
  suspectedDuplicateId: nullable(uuid),
});
const batchDetail = obj({
  id: uuid,
  name: nullable(str),
  source: str,
  status: str,
  skill: nullable(str),
  cefrTarget: nullable(str),
  topicTag: nullable(str),
  requestedCount: nullable(num),
  aiCallCount: num,
  aiCallLimit: num,
  createdAt: date,
  confirmer: nullable(person),
  jobs: arr(job),
});
const reviewJson: SchemaObject = {
  nullable: true,
  description: 'Stored review JSON; null until review or assignment.',
};
const itemDetail = obj({
  id: uuid,
  content: str,
  options,
  correctAnswer: str,
  explanation: nullable(obj({ content: str })),
  checkResults: arr(check),
  status: str,
  skill: str,
  cefrTarget: str,
  topicTag: nullable(str),
  irtB: { type: 'number' },
  generatedFromRefIds: arr(uuid),
  firstReview: reviewJson,
  secondReview: reviewJson,
  reviewEvents: arr(obj({ createdAt: date })),
  reviewer: nullable(person),
  confirmer: nullable(person),
  administrativelyCancelled: bool,
});
export const batchListResponse = obj({
  data: arr(
    obj({
      id: uuid,
      name: nullable(str),
      source: str,
      status: str,
      createdAt: date,
      _count: obj({ items: num }),
    }),
  ),
  total: num,
  page: num,
  limit: num,
});
export const rejectedStatsResponse = obj({
  data: arr(obj({ key: str, label: str, count: num })),
  page: num,
  limit: num,
  hasMore: bool,
});
export const batchDetailResponse = obj({
  batch: batchDetail,
  items: arr(itemDetail),
  administrativelyCancelledCount: num,
  total: num,
  page: num,
  limit: num,
  statusCounts: arr(obj({ status: str, count: num })),
});
export const generationResponse = obj({ batchId: uuid, status: str });
export const assignmentPreviewResponse = obj({
  batchRevision: str,
  assignments: arr(obj({ itemId: uuid, content: str, reviewerId: uuid })),
});
export const assignmentResponse = obj({ assigned: num });
export const reassignResponse = obj({ reassigned: num });
export const reassignConfirmerResponse = obj({
  confirmerId: uuid,
  affected: num,
});
export const deadlinesResponse = obj({ firstDueAt: date, secondDueAt: date });
export const cancelResponse = obj({
  cancelled: num,
  counts: obj({ DRAFT: num, FIRST_APPROVED: num }),
  status: str,
});
export const refreshResponse = obj({
  status: str,
  changed: bool,
  open: num,
  approved: num,
});
export const finalCheckResponse = obj({
  status: str,
  checked: num,
  hardRejected: num,
  softFlagged: num,
});
const c3check = obj({
  contentHash: str,
  level: str,
  reasonCodes: arr(str),
  checkedAt: date,
  suspectedDuplicateId: nullable(uuid),
});
export const finalReportResponse = obj({
  batchId: uuid,
  status: str,
  stale: bool,
  items: arr(obj({ id: uuid, status: str, stale: bool, checks: arr(c3check) })),
});
export const flagDecisionResponse = obj({ itemId: uuid, decision: str });
export const importResponse = obj({ status: str, imported: num });
const retryJob = obj({ status: str, jobStatus: str });
const checkRun = obj({
  status: str,
  remaining: num,
  exactRejected: num,
  nearRejected: num,
  nearFlagged: num,
  semanticSkipped: bool,
  semanticFlagged: num,
  answerFlagged: num,
});
export const retryGenerationResponse = retryJob;
export const retryChecksResponse: SchemaObject = {
  oneOf: [retryJob, checkRun],
};
export const gridResponse = obj({
  rows: arr(gridRow),
  operationId: nullable(uuid),
  expired: bool,
});
export const uploadResponse = obj({
  added: num,
  duplicates: num,
  rejected: arr(rejected),
  rows: arr(gridRow),
  operationId: nullable(uuid),
});
export const previewResponse = obj({
  rows: arr(obj({ row: num, candidate })),
  rejected: arr(rejected),
});
const savedBatch = obj({ batchId: uuid, status: str, count: num });
export const saveResponse = obj({
  batchId: uuid,
  status: str,
  count: num,
  batches: arr(savedBatch),
  batchIds: arr(uuid),
});
