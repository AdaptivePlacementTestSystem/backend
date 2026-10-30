import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AbilityEstimateEntity } from '../../domain/entities/ability-estimate.entity';

export interface ItemResponseInput {
  irtB: number;
  isCorrect: boolean;
}

/**
 * F-03: CAT Engine — computeEAP()
 * Expected A Posteriori (EAP) với 41-point Gaussian quadrature.
 * SRS Mục 4.3:
 * - Prior: N(0, 1) mặc định (đọc từ ConfigService)
 * - 41 quadrature points: phân bố đều trên [-4, +4], bước 0.2
 * - Clipping guard: luôn clip θ về [-4, +4]
 */
@Injectable()
export class ComputeEapUseCase {
  private readonly quadraturePoints: number[];
  private readonly priorMean: number;
  private readonly priorVariance: number;

  constructor(private readonly configService: ConfigService) {
    const numPoints =
      this.configService.get<number>('cat.quadraturePoints') ?? 41;
    this.priorMean = this.configService.get<number>('cat.priorMean') ?? 0.0;
    this.priorVariance =
      this.configService.get<number>('cat.priorVariance') ?? 1.0;

    // Sinh 41 điểm rời rạc trên [-4, +4], bước 0.2
    this.quadraturePoints = [];
    const minTheta = -4.0;
    const maxTheta = 4.0;
    const step = (maxTheta - minTheta) / (numPoints - 1);
    for (let i = 0; i < numPoints; i++) {
      this.quadraturePoints.push(parseFloat((minTheta + i * step).toFixed(4)));
    }
  }

  execute(responses: ItemResponseInput[]): AbilityEstimateEntity {
    // Nếu chưa có câu trả lời nào, trả về prior mean và prior SE
    if (!responses || responses.length === 0) {
      const defaultTheta =
        this.configService.get<number>('cat.thetaInit') ?? -0.5;
      return AbilityEstimateEntity.fromThetaAndSE(defaultTheta, 1.0);
    }

    const weights: number[] = [];
    let sumWeight = 0;
    let sumWeightedTheta = 0;

    for (const theta_k of this.quadraturePoints) {
      // Prior density: π(θ_k) = N(μ, σ²)
      const prior = this.gaussianPdf(
        theta_k,
        this.priorMean,
        this.priorVariance,
      );

      // Log-likelihood để tránh underflow số học với nhiều câu hỏi
      let logLikelihood = 0;
      for (const res of responses) {
        const p = 1 / (1 + Math.exp(-(theta_k - res.irtB)));
        const prob = res.isCorrect ? p : 1 - p;
        // Giới hạn xác suất tối thiểu để tránh log(0)
        const safeProb = Math.max(1e-12, Math.min(1 - 1e-12, prob));
        logLikelihood += Math.log(safeProb);
      }

      // Posterior weight = exp(logLikelihood) * prior
      const weight = Math.exp(logLikelihood) * prior;
      weights.push(weight);
      sumWeight += weight;
      sumWeightedTheta += theta_k * weight;
    }

    // Ước lượng EAP: E[θ | u]
    let thetaEap =
      sumWeight > 0 ? sumWeightedTheta / sumWeight : this.priorMean;

    // Clip về [-4, +4]
    thetaEap = Math.max(-4.0, Math.min(4.0, thetaEap));

    // Sai số chuẩn SE: sqrt(Var[θ | u])
    let sumWeightedVariance = 0;
    for (let i = 0; i < this.quadraturePoints.length; i++) {
      const theta_k = this.quadraturePoints[i];
      const diff = theta_k - thetaEap;
      sumWeightedVariance += diff * diff * weights[i];
    }

    let seEap =
      sumWeight > 0 ? Math.sqrt(sumWeightedVariance / sumWeight) : 1.0;
    seEap = Math.max(0.1, seEap); // sàn tối thiểu cho SE

    return AbilityEstimateEntity.fromThetaAndSE(thetaEap, seEap);
  }

  private gaussianPdf(x: number, mean: number, variance: number): number {
    const stdDev = Math.sqrt(variance);
    const exponent = -Math.pow(x - mean, 2) / (2 * variance);
    return (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
  }
}
