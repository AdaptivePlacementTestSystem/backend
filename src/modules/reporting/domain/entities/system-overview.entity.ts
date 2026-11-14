import type { CEFRLevel, ItemStatus } from '@apt/shared-types';

export type CefrCounts = Record<CEFRLevel, number>;
export type ItemStatusCounts = Record<ItemStatus, number>;

/** Một dòng của bảng "Kỳ thi đang mở" (S36). Ba số sinh viên cộng lại bằng `participantCount`. */
export interface OpenExamRoundSummary {
  id: string;
  name: string;
  opensAt: Date;
  closesAt: Date;
  durationMinutes: number;
  participantCount: number;
  /** Chưa thi = tổng − đang thi − hoàn thành (gồm cả SV bỏ dở, được thi lại). */
  notStarted: number;
  inProgress: number;
  completed: number;
}

/**
 * Tổng quan hệ thống cho Admin (F-29, UCADM05, S36); định nghĩa chỉ số: SRS 9b.19.
 * `studentsCompleted` và `cefrDistribution` chịu ảnh hưởng của `examRoundId` (BR-13);
 * các số còn lại luôn là toàn hệ thống.
 */
export class SystemOverviewEntity {
  constructor(
    public readonly examRoundId: string | null,
    public readonly studentsCompleted: number,
    public readonly finalApprovedItems: number,
    public readonly batchesNeedingAction: number,
    public readonly openExamRounds: number,
    public readonly cefrDistribution: CefrCounts,
    public readonly itemStatusCounts: ItemStatusCounts,
    public readonly openRounds: OpenExamRoundSummary[],
    public readonly generatedAt: Date,
  ) {}
}
