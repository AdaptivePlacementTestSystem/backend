/**
 * AbilityEstimate — Value Object kết quả ước lượng năng lực sau mỗi response
 * và là kết quả cuối cùng để tổng hợp LanguageProfile.
 */
export class AbilityEstimateEntity {
  constructor(
    public readonly theta: number,
    public readonly standardError: number,
    public readonly confidenceInterval95: [number, number],
  ) {}

  static fromThetaAndSE(theta: number, se: number): AbilityEstimateEntity {
    // 95% Confidence Interval: [θ - 1.96 * SE, θ + 1.96 * SE]
    const lower = parseFloat((theta - 1.96 * se).toFixed(4));
    const upper = parseFloat((theta + 1.96 * se).toFixed(4));
    return new AbilityEstimateEntity(
      parseFloat(theta.toFixed(4)),
      parseFloat(se.toFixed(4)),
      [lower, upper],
    );
  }
}
