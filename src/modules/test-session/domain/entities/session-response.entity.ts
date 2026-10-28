/**
 * Domain Entity SessionResponse — đại diện cho 1 câu trả lời trong phiên làm bài.
 */
export class SessionResponseEntity {
  constructor(
    public readonly id: string,
    public readonly sessionId: string,
    public readonly itemId: string,
    public readonly response: string,
    public readonly isCorrect: boolean,
    public readonly thetaAfter: number,
    public readonly seAfter: number,
    public readonly responseTimeMs: number | null = null,
    public readonly answeredAt: Date = new Date(),
    public readonly irtB: number = 0,
  ) {}
}
