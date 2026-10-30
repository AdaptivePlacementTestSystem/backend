import { Module } from '@nestjs/common';
import { CatEngineModule } from '../cat-engine/cat-engine.module';
import { ItemBankModule } from '../item-bank/item-bank.module';
import { TestSessionController } from './presentation/test-session.controller';
import { StartSessionUseCase } from './application/use-cases/start-session.use-case';
import { SubmitResponseUseCase } from './application/use-cases/submit-response.use-case';
import { ResumeSessionUseCase } from './application/use-cases/resume-session.use-case';
import { ComputeResultUseCase } from './application/use-cases/compute-result.use-case';
import { GetActiveSessionUseCase } from './application/use-cases/get-active-session.use-case';
import { GetSessionResultUseCase } from './application/use-cases/get-session-result.use-case';
import { GetSessionReviewUseCase } from './application/use-cases/get-session-review.use-case';
import { PrismaTestSessionRepository } from './infrastructure/persistence/prisma-test-session.repository';
import { RedisSessionCacheService } from './infrastructure/cache/redis-session-cache.service';

@Module({
  imports: [CatEngineModule, ItemBankModule],
  controllers: [TestSessionController],
  providers: [
    StartSessionUseCase,
    SubmitResponseUseCase,
    ResumeSessionUseCase,
    ComputeResultUseCase,
    GetActiveSessionUseCase,
    GetSessionResultUseCase,
    GetSessionReviewUseCase,
    PrismaTestSessionRepository,
    RedisSessionCacheService,
  ],
  exports: [PrismaTestSessionRepository],
})
export class TestSessionModule {}
