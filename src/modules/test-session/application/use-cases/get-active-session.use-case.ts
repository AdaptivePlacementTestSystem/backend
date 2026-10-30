import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { RedisSessionCacheService } from '../../infrastructure/cache/redis-session-cache.service';
import { ComputeResultUseCase } from './compute-result.use-case';
import {
  SessionStatus,
  StoppingReason,
} from '../../domain/entities/test-session.entity';

export interface ActiveSessionDto {
  activeSessionId: string;
  startedAt: Date;
  itemCount: number;
  maxItems: number;
  expiresAt: Date;
  serverTime: Date;
}

@Injectable()
export class GetActiveSessionUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cacheService: RedisSessionCacheService,
    private readonly computeResultUseCase: ComputeResultUseCase,
  ) {}

  async execute(userId: string): Promise<ActiveSessionDto | null> {
    const graceSeconds =
      this.configService.get<number>('cat.sessionGraceSeconds') ?? 60;
    const minItems =
      this.configService.get<number>('cat.boundaryMinItems') ?? 8;
    const maxItems = this.configService.get<number>('cat.maxItems') ?? 25;

    const activeSession = await this.prisma.testSession.findFirst({
      where: {
        studentId: userId,
        status: SessionStatus.IN_PROGRESS as any,
      },
      include: {
        responses: {
          orderBy: { answeredAt: 'asc' },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!activeSession) {
      return null;
    }

    // DC-20: hạn phiên là expiresAt (min của thời lượng kỳ và closesAt) + thời gian ân hạn
    if (Date.now() > activeSession.expiresAt.getTime() + graceSeconds * 1000) {
      // Phiên đã quá hạn -> Lazy Cleanup
      if (activeSession.responses.length >= minItems) {
        const lastResponse =
          activeSession.responses[activeSession.responses.length - 1];
        const thetaFinal = lastResponse?.thetaAfter ?? -0.5;
        const seFinal = lastResponse?.seAfter ?? 0.35;
        await this.computeResultUseCase.execute(
          activeSession.id,
          thetaFinal,
          seFinal,
          StoppingReason.TIMEOUT as any,
        );
      } else {
        await this.prisma.testSession.update({
          where: { id: activeSession.id },
          data: {
            status: SessionStatus.ABANDONED as any,
            stoppingReason: StoppingReason.TIMEOUT as any,
            completedAt: new Date(),
          },
        });
      }
      await this.cacheService.deleteState(activeSession.id);
      return null;
    }

    return {
      activeSessionId: activeSession.id,
      startedAt: activeSession.startedAt,
      itemCount: activeSession.responses.length,
      maxItems,
      expiresAt: activeSession.expiresAt,
      serverTime: new Date(),
    };
  }
}
