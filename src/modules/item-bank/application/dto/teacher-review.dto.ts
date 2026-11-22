import { ReviewAction, ItemStatus, Skill, CEFRLevel } from '@apt/shared-types';

export interface OptionMap {
  A: string;
  B: string;
  C: string;
  D: string;
}

export interface OriginalSnapshotDto {
  content: string;
  options: OptionMap;
  correctAnswer: string;
  explanation: string;
}

export interface FirstReviewDetailDto {
  dueAt: string;
  action: ReviewAction | null;
  reviewedAt: string | null;
  comment: string | null;
  originalSnapshot: OriginalSnapshotDto | null;
}

export interface SecondReviewDetailDto {
  dueAt: string;
  action: ReviewAction | null;
  confirmedAt: string | null;
  comment: string | null;
}

export interface ItemFlagDto {
  level: string;
  reasonCodes: string[];
  suspectedDuplicateId?: string | null;
}

export interface ReviewItemDetailDto {
  id: string;
  content: string;
  options: OptionMap;
  correctAnswer: string;
  skill: Skill | string;
  cefrTarget: CEFRLevel | string;
  topicTag: string | null;
  irtB: number;
  status: ItemStatus | string;
  explanation: string;
  firstReview: FirstReviewDetailDto | null;
  secondReview?: SecondReviewDetailDto | null;
  hasEdited: boolean;
  flags: ItemFlagDto[];
  reviewerName?: string;
}

export interface ReviewBatchSummaryDto {
  batchId: string;
  batchName: string;
  totalAssigned: number;
  decidedCount: number;
  pendingCount: number;
  dueAt: string | null;
  isOverdue: boolean;
}

export interface TeacherTaskStatsDto {
  pendingReviews: number;
  pendingConfirms: number;
}

export interface ReviewTasksResponseDto {
  batches: ReviewBatchSummaryDto[];
  stats: TeacherTaskStatsDto;
}

export interface ConfirmBatchSummaryDto {
  batchId: string;
  batchName: string;
  totalAssigned: number;
  pendingCount: number;
  confirmedCount: number;
  removedCount: number;
  decidedCount: number;
  dueAt: string | null;
  isOverdue: boolean;
}

export interface ConfirmTasksResponseDto {
  batches: ConfirmBatchSummaryDto[];
  stats: TeacherTaskStatsDto;
}

export interface EditItemDto {
  content?: string;
  options?: OptionMap;
  correctAnswer?: string;
  explanation?: string;
}

export interface ReviewDecisionDto {
  action: 'APPROVE' | 'REJECT';
  comment?: string;
}

export interface ConfirmDecisionDto {
  action: 'CONFIRM' | 'REMOVE';
  comment?: string;
}
