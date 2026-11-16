import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaTestSessionRepository } from '../../infrastructure/persistence/prisma-test-session.repository';
import { RedisSessionCacheService } from '../../infrastructure/cache/redis-session-cache.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ComputeResultUseCase } from './compute-result.use-case';
import type { IItemRepository } from '../../../item-bank/domain/repositories/item.repository.interface';
import { ItemEntity } from '../../../item-bank/domain/entities/item.entity';
import {
  SessionStatus,
  StoppingReason,
} from '../../domain/entities/test-session.entity';

@Injectable()
export class ResumeSessionUseCase {
  constructor(
    private readonly sessionRepository: PrismaTestSessionRepository,
    private readonly cacheService: RedisSessionCacheService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly computeResultUseCase: ComputeResultUseCase,
    @Inject('IItemRepository')
    private readonly itemRepository: IItemRepository,
  ) {}

  async execute(sessionId: string): Promise<{
    examRoundId?: string;
    currentItem: ItemEntity | null;
    state: any;
    isExpired?: boolean;
  }> {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên làm bài');
    }

    const graceSeconds =
      this.configService.get<number>('cat.sessionGraceSeconds') ?? 60;
    const minItems =
      this.configService.get<number>('cat.boundaryMinItems') ?? 8;

    // Quy tắc K5 / DC-20: Hết hạn phiên -> Lazy Cleanup
    if (
      session.status === SessionStatus.IN_PROGRESS &&
      session.expiresAt &&
      Date.now() > session.expiresAt.getTime() + graceSeconds * 1000
    ) {
      if (session.responses.length >= minItems) {
        const lastResponse = session.responses[session.responses.length - 1];
        const thetaFinal = lastResponse?.thetaAfter ?? -0.5;
        const seFinal = lastResponse?.seAfter ?? 0.35;
        await this.computeResultUseCase.execute(
          session.id,
          thetaFinal,
          seFinal,
          StoppingReason.TIMEOUT,
        );
      } else {
        await this.prisma.testSession.update({
          where: { id: session.id },
          data: {
            status: SessionStatus.ABANDONED as any,
            stoppingReason: StoppingReason.TIMEOUT as any,
            completedAt: new Date(),
          },
        });
      }
      await this.cacheService.deleteState(session.id);
      return {
        currentItem: null,
        state: {
          state:
            session.responses.length >= minItems ? 'COMPLETED' : 'ABANDONED',
          stoppingReason: StoppingReason.TIMEOUT,
        },
        isExpired: true,
      };
    }

    if (session.status !== SessionStatus.IN_PROGRESS) {
      return {
        currentItem: null,
        state: {
          state: session.status,
          stoppingReason: session.stoppingReason,
        },
        isExpired: true,
      };
    }

    let cacheState = await this.cacheService.getState(sessionId);

    if (!cacheState) {
      const responses = session.responses;
      const lastResponse =
        responses.length > 0 ? responses[responses.length - 1] : null;

      cacheState = {
        state: 'READY_FOR_NEXT',
        currentItemId: null,
        theta: lastResponse ? lastResponse.thetaAfter : -0.5,
        se: lastResponse ? lastResponse.seAfter : 1.0,
        lastSkillPicked: null,
        itemsAdministered: responses.map((r) => r.itemId),
        lastUpdated: new Date().toISOString(),
      };
      await this.cacheService.setState(sessionId, cacheState);
    }

    let currentItem: ItemEntity | null = null;
    if (cacheState.currentItemId) {
      currentItem = await this.itemRepository.findById(
        cacheState.currentItemId,
      );
    }

    return {
      examRoundId: session.examRoundId,
      currentItem,
      state: cacheState,
    };
  }
}
