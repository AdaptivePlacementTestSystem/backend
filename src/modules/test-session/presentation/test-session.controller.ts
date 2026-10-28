import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { StartSessionUseCase } from '../application/use-cases/start-session.use-case';
import { SubmitResponseUseCase, SubmitResponseDto } from '../application/use-cases/submit-response.use-case';
import { ResumeSessionUseCase } from '../application/use-cases/resume-session.use-case';
import { GetActiveSessionUseCase } from '../application/use-cases/get-active-session.use-case';
import { GetSessionResultUseCase } from '../application/use-cases/get-session-result.use-case';
import { GetSessionReviewUseCase } from '../application/use-cases/get-session-review.use-case';
import { CatEngineService } from '../../cat-engine/application/services/cat-engine.service';
import { RedisSessionCacheService } from '../infrastructure/cache/redis-session-cache.service';
import { PrismaTestSessionRepository } from '../infrastructure/persistence/prisma-test-session.repository';
import type { IItemRepository } from '../../item-bank/domain/repositories/item.repository.interface';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../../shared/decorators/current-user.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';

export class SubmitResponseBodyDto {
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

export class StartSessionBodyDto {
  @IsUUID()
  examRoundId: string;
}

@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TestSessionController {
  constructor(
    private readonly startSessionUseCase: StartSessionUseCase,
    private readonly submitResponseUseCase: SubmitResponseUseCase,
    private readonly resumeSessionUseCase: ResumeSessionUseCase,
    private readonly getActiveSessionUseCase: GetActiveSessionUseCase,
    private readonly getSessionResultUseCase: GetSessionResultUseCase,
    private readonly getSessionReviewUseCase: GetSessionReviewUseCase,
    private readonly sessionRepository: PrismaTestSessionRepository,
    private readonly catEngineService: CatEngineService,
    private readonly cacheService: RedisSessionCacheService,
    @Inject('IItemRepository')
    private readonly itemRepository: IItemRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.STUDENT, UserRole.ADMIN)
  async startSession(@CurrentUser() user: JwtPayload, @Body() body: StartSessionBodyDto) {
    return this.startSessionUseCase.execute(user.sub, body.examRoundId);
  }

  @Get('active')
  @Roles(UserRole.STUDENT, UserRole.ADMIN)
  async getActiveSession(@CurrentUser() user: JwtPayload) {
    return this.getActiveSessionUseCase.execute(user.sub);
  }

  @Get(':id/next-item')
  async getNextItem(
    @Param('id') sessionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertSessionOwnership(sessionId, user);

    const cacheState = await this.cacheService.getState(sessionId);

    // Nếu đang chờ câu trả lời cho câu hỏi hiện tại, trả lại câu hỏi đó (chống spam reload)
    if (cacheState && cacheState.state === 'WAITING_FOR_ANSWER' && cacheState.currentItemId) {
      const existingItem = await this.itemRepository.findById(cacheState.currentItemId);
      if (existingItem) {
        return this.formatItemForStudent(existingItem);
      }
    }

    // 1. Chọn kỹ năng tiếp theo (Round-robin)
    const nextSkill = this.catEngineService.pickNextSkill(cacheState?.lastSkillPicked ?? null);

    // 2. Lấy danh sách Top-5 ứng viên gần theta nhất
    const usedIds = cacheState?.itemsAdministered ?? [];
    const currentTheta = cacheState?.theta ?? -0.5;
    const candidates = await this.itemRepository.findForCAT(nextSkill, usedIds, currentTheta, 5);

    // 3. Chọn ngẫu nhiên đều 1 câu từ Top-5
    const selectedItem = this.catEngineService.selectNextItem(candidates);
    if (!selectedItem) {
      return { message: 'Không còn câu hỏi phù hợp trong ngân hàng đề' };
    }

    // 4. Cập nhật state machine sang WAITING_FOR_ANSWER
    await this.cacheService.setState(sessionId, {
      state: 'WAITING_FOR_ANSWER',
      currentItemId: selectedItem.id,
      theta: currentTheta,
      se: cacheState?.se ?? 1.0,
      lastSkillPicked: nextSkill,
      itemsAdministered: usedIds,
      lastUpdated: new Date().toISOString(),
    });

    return this.formatItemForStudent(selectedItem);
  }

  @Post(':id/responses')
  @HttpCode(HttpStatus.OK)
  async submitResponse(
    @Param('id') sessionId: string,
    @Body() body: SubmitResponseBodyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertSessionOwnership(sessionId, user);

    const dto: SubmitResponseDto = {
      sessionId,
      itemId: body.itemId,
      response: body.response,
      responseTimeMs: body.responseTimeMs,
    };
    const result = await this.submitResponseUseCase.execute(dto);

    // Quyết định #59 & PX.14: Không trả isCorrect, thetaAfter, seAfter trong lúc làm bài
    return {
      shouldStop: result.shouldStop,
      stoppingReason: result.stoppingReason,
    };
  }

  @Get(':id/resume')
  async resumeSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertSessionOwnership(sessionId, user);
    return this.resumeSessionUseCase.execute(sessionId);
  }

  @Get(':id/result')
  async getResult(
    @Param('id') sessionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.getSessionResultUseCase.execute(sessionId, user.sub, user.role);
  }

  @Get(':id/review')
  async getReview(
    @Param('id') sessionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.getSessionReviewUseCase.execute(sessionId, user.sub, user.role);
  }

  private async assertSessionOwnership(sessionId: string, user: JwtPayload) {
    if (user.role === UserRole.ADMIN) return;
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên làm bài');
    }
    if (session.studentId !== user.sub) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên phiên làm bài này');
    }
  }

  /**
   * Sinh viên KHÔNG được xem đáp án đúng trước khi hoàn thành bài thi (SRS Mục 15.3).
   */
  private formatItemForStudent(item: any) {
    return {
      id: item.id,
      content: item.content,
      options: item.options,
      skill: item.skill,
      cefrTarget: item.cefrTarget,
    };
  }
}
