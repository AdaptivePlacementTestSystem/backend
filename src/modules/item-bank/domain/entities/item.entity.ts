import { Skill, CEFRLevel, ItemStatus } from '@apt/shared-types';

export type OptionMap = {
  A: string;
  B: string;
  C: string;
  D: string;
};

/**
 * Domain Entity Item (Câu hỏi trắc nghiệm) — thuần TypeScript, không phụ thuộc ORM.
 * Mô hình Rasch 1PL: irtA = 1.0 cố định.
 * SRS v3.0: ItemStatus có 6 trạng thái, CAT lọc theo FINAL_APPROVED.
 */
export class ItemEntity {
  constructor(
    public readonly id: string,
    public content: string,
    public options: OptionMap,
    public correctAnswer: string,
    public readonly skill: Skill,
    public readonly cefrTarget: CEFRLevel,
    public irtB: number,
    public irtA: number = 1.0,
    public irtC: number = 0.25,
    public status: ItemStatus = ItemStatus.DRAFT,
    public batchId: string = '',
    public packageId: string | null = null,
    public contentHash: string | null = null,
    public topicTag: string | null = null,
    public approvedById: string | null = null,
    public approvedAt: Date | null = null,
    public timesUsed: number = 0,
    public calibrated: boolean = false,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date(),
  ) {}

  /**
   * Xác suất trả lời đúng theo mô hình Rasch 1PL:
   * P(θ, b_i) = exp(θ - b_i) / [1 + exp(θ - b_i)]
   */
  probability(theta: number): number {
    const exponent = this.irtA * (theta - this.irtB);
    return 1 / (1 + Math.exp(-exponent));
  }

  /** Chỉ câu FINAL_APPROVED mới được CAT chọn. */
  isFinalApproved(): boolean {
    return this.status === ItemStatus.FINAL_APPROVED;
  }

  incrementTimesUsed(): void {
    this.timesUsed += 1;
    this.updatedAt = new Date();
  }
}
