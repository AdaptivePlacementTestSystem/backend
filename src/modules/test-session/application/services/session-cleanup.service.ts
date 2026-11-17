import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { RedisSessionCacheService } from '../../infrastructure/cache/redis-session-cache.service';
import { ComputeResultUseCase } from '../use-cases/compute-result.use-case';
import {
  SessionStatus,
  StoppingReason,
} from '../../domain/entities/test-session.entity';

export interface CleanupResult {
  isExpired: boolean;
  status?: SessionStatus;
  stoppingReason?: StoppingReason;
}

/**
 * SessionCleanupService — Dịch vụ tập trung xử lý cơ chế Lazy Cleanup K5 / DC-20.
 * Được dùng chung bởi: startSession, resumeSession, getCurrentRoundSession, getNextItem.
 */
@Injectable()
export class SessionCleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cacheService: RedisSessionCacheService,
    private readonly computeResultUseCase: ComputeResultUseCase,
  ) {}

  async cleanupIfExpired(session: {
    id: string;
    status: SessionStatus | string;
    expiresAt: Date | null;
    responses: Array<{ thetaAfter?: number | null; seAfter?: number | null }>;
  }): Promise<CleanupResult> {
    if (session.status !== SessionStatus.IN_PROGRESS || !session.expiresAt) {
      return { isExpired: false };
    }

    const graceSeconds =
      this.configService.get<number>('cat.sessionGraceSeconds') ?? 60;
    const minItems =
      this.configService.get<number>('cat.boundaryMinItems') ?? 8;

    // Kiểm tra đã quá hạn (kèm thời gian ân hạn grace period)
    const isExpired =
      Date.now() > session.expiresAt.getTime() + graceSeconds * 1000;
    if (!isExpired) {
      return { isExpired: false };
    }

    // Đã quá hạn -> Lazy Cleanup K5
    const responseCount = session.responses?.length ?? 0;
    if (responseCount >= minItems) {
      const lastResponse = session.responses[responseCount - 1];
      const thetaFinal = lastResponse?.thetaAfter ?? -0.5;
      const seFinal = lastResponse?.seAfter ?? 0.35;

      await this.computeResultUseCase.execute(
        session.id,
        thetaFinal,
        seFinal,
        StoppingReason.TIMEOUT,
      );
      await this.cacheService.deleteState(session.id);

      return {
        isExpired: true,
        status: SessionStatus.COMPLETED,
        stoppingReason: StoppingReason.TIMEOUT,
      };
    } else {
      await this.prisma.testSession.update({
        where: { id: session.id },
        data: {
          status: SessionStatus.ABANDONED as any,
          stoppingReason: StoppingReason.TIMEOUT as any,
          completedAt: new Date(),
        },
      });
      await this.cacheService.deleteState(session.id);

      return {
        isExpired: true,
        status: SessionStatus.ABANDONED,
        stoppingReason: StoppingReason.TIMEOUT,
      };
    }
  }
}
