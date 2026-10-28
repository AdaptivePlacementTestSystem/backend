import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaTestSessionRepository } from '../../infrastructure/persistence/prisma-test-session.repository';
import { RedisSessionCacheService } from '../../infrastructure/cache/redis-session-cache.service';
import type { IItemRepository } from '../../../item-bank/domain/repositories/item.repository.interface';
import { ItemEntity } from '../../../item-bank/domain/entities/item.entity';

@Injectable()
export class ResumeSessionUseCase {
  constructor(
    private readonly sessionRepository: PrismaTestSessionRepository,
    private readonly cacheService: RedisSessionCacheService,
    @Inject('IItemRepository')
    private readonly itemRepository: IItemRepository,
  ) {}

  async execute(sessionId: string): Promise<{ currentItem: ItemEntity | null; state: any }> {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên làm bài');
    }

    let cacheState = await this.cacheService.getState(sessionId);

    if (!cacheState) {
      const responses = session.responses;
      const lastResponse = responses.length > 0 ? responses[responses.length - 1] : null;

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
      currentItem = await this.itemRepository.findById(cacheState.currentItemId);
    }

    return {
      currentItem,
      state: cacheState,
    };
  }
}
