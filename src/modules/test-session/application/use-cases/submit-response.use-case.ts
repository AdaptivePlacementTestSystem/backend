import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { PrismaTestSessionRepository } from '../../infrastructure/persistence/prisma-test-session.repository';
import { RedisSessionCacheService } from '../../infrastructure/cache/redis-session-cache.service';
import { CatEngineService } from '../../../cat-engine/application/services/cat-engine.service';
import type { IItemRepository } from '../../../item-bank/domain/repositories/item.repository.interface';
import { SessionResponseEntity } from '../../domain/entities/session-response.entity';
import { ComputeResultUseCase } from './compute-result.use-case';
import { randomUUID } from 'crypto';

import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class SubmitResponseDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  itemId: string;

  @IsString()
  @IsIn(['A', 'B', 'C', 'D'], { message: 'Đáp án phải là A, B, C hoặc D' })
  response: 'A' | 'B' | 'C' | 'D';

  @IsNumber()
  @IsOptional()
  responseTimeMs?: number;
}

export interface SubmitResponseResult {
  isCorrect: boolean;
  thetaAfter: number;
  seAfter: number;
  shouldStop: boolean;
  stoppingReason?: string;
}

@Injectable()
export class SubmitResponseUseCase {
  constructor(
    private readonly sessionRepository: PrismaTestSessionRepository,
    private readonly cacheService: RedisSessionCacheService,
    private readonly catEngineService: CatEngineService,
    @Inject('IItemRepository')
    private readonly itemRepository: IItemRepository,
    private readonly computeResultUseCase: ComputeResultUseCase,
  ) {}

  async execute(dto: SubmitResponseDto): Promise<SubmitResponseResult> {
    const session = await this.sessionRepository.findById(dto.sessionId);
    if (!session || session.isCompleted()) {
      throw new BadRequestException('Phiên thi không tồn tại hoặc đã kết thúc');
    }

    let cacheState = await this.cacheService.getState(dto.sessionId);
    if (
      cacheState &&
      cacheState.state === 'WAITING_FOR_ANSWER' &&
      cacheState.currentItemId !== dto.itemId
    ) {
      throw new BadRequestException(
        'Câu hỏi nộp không khớp với câu hỏi hiện tại',
      );
    }

    const item = await this.itemRepository.findById(dto.itemId);
    if (!item) {
      throw new NotFoundException('Không tìm thấy câu hỏi tương ứng');
    }

    const isCorrect =
      item.correctAnswer.toUpperCase() === dto.response.toUpperCase();

    const previousResponses = session.responses.map((r) => ({
      irtB: r.irtB,
      isCorrect: r.isCorrect,
    }));

    const allHistory = [...previousResponses, { irtB: item.irtB, isCorrect }];

    const estimate = this.catEngineService.computeEAP(allHistory);

    const stoppingCheck = this.catEngineService.checkStoppingCriterion({
      itemCount: allHistory.length,
      standardError: estimate.standardError,
      currentTheta: estimate.theta,
      expiresAt: session.expiresAt,
    });

    const responseEntity = new SessionResponseEntity(
      randomUUID(),
      dto.sessionId,
      dto.itemId,
      dto.response,
      isCorrect,
      estimate.theta,
      estimate.standardError,
      dto.responseTimeMs ?? null,
      new Date(),
      item.irtB,
    );
    await this.sessionRepository.recordResponse(responseEntity);

    const updatedAdministered = cacheState
      ? [...cacheState.itemsAdministered, dto.itemId]
      : [dto.itemId];
    await this.cacheService.setState(dto.sessionId, {
      state: 'READY_FOR_NEXT',
      currentItemId: null,
      theta: estimate.theta,
      se: estimate.standardError,
      lastSkillPicked: cacheState?.lastSkillPicked ?? item.skill,
      itemsAdministered: updatedAdministered,
      lastUpdated: new Date().toISOString(),
    });

    if (stoppingCheck.shouldStop && stoppingCheck.reason) {
      await this.computeResultUseCase.execute(
        dto.sessionId,
        estimate.theta,
        estimate.standardError,
        stoppingCheck.reason as any,
      );
    }

    return {
      isCorrect,
      thetaAfter: estimate.theta,
      seAfter: estimate.standardError,
      shouldStop: stoppingCheck.shouldStop,
      stoppingReason: stoppingCheck.reason,
    };
  }
}
