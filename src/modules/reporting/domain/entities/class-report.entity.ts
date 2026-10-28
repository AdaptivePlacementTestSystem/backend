import { CEFRLevel } from '@prisma/client';

export type CEFRDistribution = Record<CEFRLevel, number>;

/**
 * Domain Entity ClassReport — dữ liệu tổng hợp năng lực của một lớp/khoá/trường (SRS v3.0).
 * Lọc theo kỳ thi examRoundId nếu có.
 */
export class ClassReportEntity {
  constructor(
    public readonly examRoundId: string | null,
    public readonly totalStudents: number,
    public readonly cefrDistribution: CEFRDistribution,
    public readonly averageTheta: number,
    public readonly generatedAt: Date = new Date(),
  ) {}
}
