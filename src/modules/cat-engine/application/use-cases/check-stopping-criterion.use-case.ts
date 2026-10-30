import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StoppingCriterionResult } from '../../domain/services/cat-engine.domain-service';

export interface CheckStoppingParams {
  itemCount: number;
  standardError: number;
  currentTheta: number;
  /** Hạn phiên = min(startedAt + durationMinutes của kỳ, closesAt), tính lúc bắt đầu phiên (DC-20). */
  expiresAt: Date;
}

/**
 * F-03: CAT Engine — checkStoppingCriterion()
 * Kiểm tra 4 điều kiện dừng theo đúng thứ tự ưu tiên (SRS Mục 4.5, Luong_Hoat_Dong_CATEngine.md):
 * 1. SE < 0.35 -> 'SE_THRESHOLD' (đủ tin cậy)
 * 2. Outlier Early Stop: θ > 1.5 hoặc θ < -2.5, sau ≥ 8 câu -> 'ITEM_BANK_BOUNDARY'
 * 3. Đã hỏi đủ 25 câu -> 'MAX_ITEMS_REACHED'
 * 4. Hết hạn phiên (expiresAt, DC-20) -> 'TIMEOUT'
 */
@Injectable()
export class CheckStoppingCriterionUseCase {
  private readonly seThreshold: number;
  private readonly maxItems: number;
  private readonly outlierThetaMin: number;
  private readonly outlierThetaMax: number;
  private readonly outlierMinItems: number;

  constructor(private readonly configService: ConfigService) {
    this.seThreshold =
      this.configService.get<number>('cat.seThreshold') ?? 0.35;
    this.maxItems = this.configService.get<number>('cat.maxItems') ?? 25;
    this.outlierThetaMin =
      this.configService.get<number>('cat.outlierThetaMin') ??
      this.configService.get<number>('cat.boundaryBMin') ??
      -2.5;
    this.outlierThetaMax =
      this.configService.get<number>('cat.outlierThetaMax') ??
      this.configService.get<number>('cat.boundaryBMax') ??
      1.5;
    this.outlierMinItems =
      this.configService.get<number>('cat.outlierMinItems') ??
      this.configService.get<number>('cat.boundaryMinItems') ??
      8;
  }

  execute(params: CheckStoppingParams): StoppingCriterionResult {
    // 1. Ưu tiên 1: Đạt ngưỡng sai số chuẩn SE < 0.35
    if (params.standardError < this.seThreshold) {
      return {
        shouldStop: true,
        reason: 'SE_THRESHOLD',
      };
    }

    // 2. Ưu tiên 2: Outlier Early Stop (θ < outlierThetaMin hoặc θ > outlierThetaMax) sau >= outlierMinItems câu (SRS Mục 4.5)
    if (
      params.itemCount >= this.outlierMinItems &&
      (params.currentTheta < this.outlierThetaMin ||
        params.currentTheta > this.outlierThetaMax)
    ) {
      return {
        shouldStop: true,
        reason: 'ITEM_BANK_BOUNDARY',
      };
    }

    // 3. Ưu tiên 3: Hết số câu tối đa (25 câu)
    if (params.itemCount >= this.maxItems) {
      return {
        shouldStop: true,
        reason: 'MAX_ITEMS_REACHED',
      };
    }

    // 4. Ưu tiên 4: Hết hạn phiên thi (expiresAt do kỳ thi quyết định)
    if (Date.now() >= new Date(params.expiresAt).getTime()) {
      return {
        shouldStop: true,
        reason: 'TIMEOUT',
      };
    }

    // Chưa thỏa điều kiện dừng -> tiếp tục bài thi
    return {
      shouldStop: false,
    };
  }
}
