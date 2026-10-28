/**
 * EAPComputationState — Value Object đóng gói trạng thái Bayesian quadrature:
 * posteriorWeights: 41 trọng số hậu nghiệm tương ứng 41 điểm mốc [-4, +4], bước 0.2
 * theta: ước lượng năng lực hiện tại
 * standardError: sai số chuẩn SE(θ)
 */
export class EAPComputationStateEntity {
  constructor(
    public readonly theta: number,
    public readonly standardError: number,
    public readonly posteriorWeights: number[] = [],
  ) {}

  static initial(thetaInit: number = -0.5): EAPComputationStateEntity {
    return new EAPComputationStateEntity(thetaInit, 1.0, []);
  }
}
