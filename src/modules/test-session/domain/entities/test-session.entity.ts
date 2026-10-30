import { SessionResponseEntity } from './session-response.entity';
import { SessionStatus, StoppingReason } from '@apt/shared-types';

export { SessionStatus, StoppingReason };

/**
 * Domain Entity TestSession — đại diện cho 1 phiên làm bài thi CAT (SRS v3.0).
 */
export class TestSessionEntity {
  constructor(
    public readonly id: string,
    public readonly studentId: string,
    public readonly examRoundId: string,
    public status: SessionStatus = SessionStatus.IN_PROGRESS,
    public thetaFinal: number | null = null,
    public seFinal: number | null = null,
    public stoppingReason: StoppingReason | null = null,
    public readonly startedAt: Date = new Date(),
    public completedAt: Date | null = null,
    public responses: SessionResponseEntity[] = [],
    public expiresAt: Date = new Date(),
  ) {}

  isCompleted(): boolean {
    return this.status === SessionStatus.COMPLETED;
  }

  complete(theta: number, se: number, reason: StoppingReason): void {
    this.status = SessionStatus.COMPLETED;
    this.thetaFinal = theta;
    this.seFinal = se;
    this.stoppingReason = reason;
    this.completedAt = new Date();
  }
}
