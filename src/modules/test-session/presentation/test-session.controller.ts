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
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { StartSessionUseCase } from '../application/use-cases/start-session.use-case';
import {
  SubmitResponseUseCase,
  SubmitResponseDto,
} from '../application/use-cases/submit-response.use-case';
import { ResumeSessionUseCase } from '../application/use-cases/resume-session.use-case';
import { GetActiveSessionUseCase } from '../application/use-cases/get-active-session.use-case';
import { GetSessionResultUseCase } from '../application/use-cases/get-session-result.use-case';
import { GetSessionReviewUseCase } from '../application/use-cases/get-session-review.use-case';
import { ComputeResultUseCase } from '../application/use-cases/compute-result.use-case';
import { SessionCleanupService } from '../application/services/session-cleanup.service';
import { ConfigService } from '@nestjs/config';
import { CatEngineService } from '../../cat-engine/application/services/cat-engine.service';
import { RedisSessionCacheService } from '../infrastructure/cache/redis-session-cache.service';
import { PrismaTestSessionRepository } from '../infrastructure/persistence/prisma-test-session.repository';
import type { IItemRepository } from '../../item-bank/domain/repositories/item.repository.interface';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../../shared/decorators/current-user.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import {
  SessionStatus,
  StoppingReason,
} from '../domain/entities/test-session.entity';
import {
  ApiProperty,
  ApiPropertyOptional,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiExtraModels,
} from '@nestjs/swagger';

export class SubmitResponseBodyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @ApiProperty({ enum: ['A', 'B', 'C', 'D'] })
  @IsString()
  @IsIn(['A', 'B', 'C', 'D'], { message: 'Đáp án phải là A, B, C hoặc D' })
  response: 'A' | 'B' | 'C' | 'D';

  @ApiPropertyOptional({ type: Number })
  @IsNumber()
  @IsOptional()
  responseTimeMs?: number;
}

export class StartSessionBodyDto {
  @ApiProperty({ format: 'uuid' })
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'examRoundId phải là UUID hợp lệ',
  })
  examRoundId: string;
}

class StartSessionResponseDto {
  @ApiProperty() sessionId: string;
  @ApiProperty({ format: 'date-time' }) expiresAt: string;
}

class SubmitSessionResponseDto {
  @ApiProperty({ enum: [true] }) accepted: boolean;
  @ApiProperty() shouldStop: boolean;
  @ApiPropertyOptional() stoppingReason?: string;
}

class SessionMetaDto {
  @ApiProperty() id: string;
  @ApiProperty() itemCount: number;
  @ApiProperty() maxItems: number;
  @ApiProperty({ format: 'date-time' }) expiresAt: string;
  @ApiProperty({ format: 'date-time' }) serverTime: string;
}

class ExamItemDto {
  @ApiProperty() id: string;
  @ApiProperty() content: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  options: Record<string, string>;
  @ApiProperty() skill: string;
  @ApiProperty() cefrTarget: string;
}

class NextItemDto {
  @ApiProperty({ enum: ['item'] }) kind: string;
  @ApiProperty({ type: SessionMetaDto }) session: SessionMetaDto;
  @ApiProperty({ type: ExamItemDto }) item: ExamItemDto;
}

class FinishedSessionDto {
  @ApiProperty({ enum: ['finished'] }) kind: string;
  @ApiProperty() reason: string;
  @ApiProperty() sessionId: string;
}

class ActiveSessionDto {
  @ApiProperty() activeSessionId: string;
  @ApiProperty() examRoundId: string;
  @ApiProperty({ format: 'date-time' }) startedAt: string;
  @ApiProperty() itemCount: number;
  @ApiProperty() maxItems: number;
  @ApiProperty({ format: 'date-time' }) expiresAt: string;
  @ApiProperty({ format: 'date-time' }) serverTime: string;
}

class ResumeSessionResponseDto {
  @ApiPropertyOptional() examRoundId?: string;
  @ApiProperty({ type: ExamItemDto, nullable: true })
  currentItem: ExamItemDto | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) state: Record<
    string,
    unknown
  >;
  @ApiPropertyOptional() isExpired?: boolean;
}

class ReviewEntryDto {
  @ApiProperty() questionNumber: number;
  @ApiProperty() itemId: string;
  @ApiProperty() content: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  options: Record<string, string>;
  @ApiProperty() selectedAnswer: string;
  @ApiProperty() correctAnswer: string;
  @ApiProperty() isCorrect: boolean;
  @ApiProperty() skill: string;
  @ApiProperty() cefrTarget: string;
  @ApiProperty() irtB: number;
  @ApiProperty({ type: String, nullable: true }) explanation: string | null;
}

class SkillProfileResponseDto {
  @ApiProperty() skill: string;
  @ApiProperty() itemsAdministered: number;
  @ApiProperty() correctCount: number;
  @ApiPropertyOptional({ type: Number }) scorePercent?: number;
  @ApiPropertyOptional({ type: Number }) accuracyRate?: number;
}

class ErrorPatternResponseDto {
  @ApiProperty() topicTag: string;
  @ApiProperty() skill: string;
  @ApiProperty() itemsAttempted: number;
  @ApiProperty() correctCount: number;
  @ApiProperty() accuracyRate: number;
  @ApiProperty() severity: string;
}

class SessionResultDto {
  @ApiProperty() sessionId: string;
  @ApiProperty() status: string;
  @ApiProperty({ type: Number, nullable: true }) thetaFinal: number | null;
  @ApiProperty({ type: Number, nullable: true }) seFinal: number | null;
  @ApiProperty() cefrLevel: string;
  @ApiProperty() confidenceLevel: string;
  @ApiProperty() boundaryEffect: boolean;
  @ApiProperty({ type: [Number] }) confidenceInterval95: number[];
  @ApiProperty() totalItems: number;
  @ApiProperty({ format: 'date-time' }) startedAt: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  completedAt: string | null;
  @ApiProperty() durationSeconds: number;
  @ApiProperty({ type: String, nullable: true }) stoppingReason: string | null;
  @ApiProperty({ type: [SkillProfileResponseDto] })
  skillProfiles: SkillProfileResponseDto[];
  @ApiProperty({ type: [ErrorPatternResponseDto] })
  errorPatterns: ErrorPatternResponseDto[];
  @ApiProperty({ type: [String] }) aiRecommendations: string[];
}

@Controller('sessions')
@ApiBearerAuth()
@ApiExtraModels(NextItemDto, FinishedSessionDto, ActiveSessionDto)
@UseGuards(JwtAuthGuard, RolesGuard)
export class TestSessionController {
  constructor(
    private readonly startSessionUseCase: StartSessionUseCase,
    private readonly submitResponseUseCase: SubmitResponseUseCase,
    private readonly resumeSessionUseCase: ResumeSessionUseCase,
    private readonly getActiveSessionUseCase: GetActiveSessionUseCase,
    private readonly getSessionResultUseCase: GetSessionResultUseCase,
    private readonly getSessionReviewUseCase: GetSessionReviewUseCase,
    private readonly computeResultUseCase: ComputeResultUseCase,
    private readonly sessionCleanupService: SessionCleanupService,
    private readonly configService: ConfigService,
    private readonly sessionRepository: PrismaTestSessionRepository,
    private readonly catEngineService: CatEngineService,
    private readonly cacheService: RedisSessionCacheService,
    @Inject('IItemRepository')
    private readonly itemRepository: IItemRepository,
  ) {}

  @Post()
  @ApiCreatedResponse({ type: StartSessionResponseDto })
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.STUDENT)
  async startSession(
    @CurrentUser() user: JwtPayload,
    @Body() body: StartSessionBodyDto,
  ) {
    return this.startSessionUseCase.execute(user.sub, body.examRoundId);
  }

  @Get('active')
  @ApiOkResponse({
    description: 'Khi không có phiên, backend trả status 200 với body rỗng.',
    schema: {
      allOf: [{ $ref: '#/components/schemas/ActiveSessionDto' }],
    },
  })
  @Roles(UserRole.STUDENT)
  async getActiveSession(@CurrentUser() user: JwtPayload) {
    return this.getActiveSessionUseCase.execute(user.sub);
  }

  @Get(':id/next-item')
  @Roles(UserRole.STUDENT)
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: '#/components/schemas/NextItemDto' },
        { $ref: '#/components/schemas/FinishedSessionDto' },
      ],
    },
  })
  async getNextItem(
    @Param('id') sessionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const session = await this.assertSessionOwnership(sessionId, user);

    // 1. Kiểm tra nếu phiên đã kết thúc trước đó
    if (session.status !== SessionStatus.IN_PROGRESS) {
      return {
        kind: 'finished',
        reason: session.stoppingReason ?? 'SE_THRESHOLD',
        sessionId: session.id,
      };
    }

    // 2. Kiểm tra quá hạn thời gian làm bài (Lazy Cleanup K5 / DC-20)
    const cleanupResult =
      await this.sessionCleanupService.cleanupIfExpired(session);
    if (cleanupResult.isExpired) {
      return {
        kind: 'finished',
        reason: cleanupResult.stoppingReason ?? 'TIMEOUT',
        sessionId: session.id,
      };
    }

    // 3. Lấy metadata phiên thi từ ConfigService (không hardcode)
    const maxItems = this.configService.get<number>('cat.maxItems') ?? 25;
    const sessionMeta = {
      id: session.id,
      itemCount: session.responses?.length ?? 0,
      maxItems,
      expiresAt: session.expiresAt.toISOString(),
      serverTime: new Date().toISOString(),
    };

    const cacheState = await this.cacheService.getState(sessionId);

    // Nếu đang chờ câu trả lời cho câu hỏi hiện tại, trả lại câu hỏi đó (chống spam reload)
    if (
      cacheState &&
      cacheState.state === 'WAITING_FOR_ANSWER' &&
      cacheState.currentItemId
    ) {
      const existingItem = await this.itemRepository.findById(
        cacheState.currentItemId,
      );
      if (existingItem) {
        return {
          kind: 'item',
          session: sessionMeta,
          item: this.formatItemForStudent(existingItem),
        };
      }
    }

    // 4. Reconstruct fallback từ DB nếu Redis mất kết nối/trống cache (bảo toàn tiến trình thi)
    const responses = session.responses ?? [];
    const lastDbResponse =
      responses.length > 0 ? responses[responses.length - 1] : null;
    const usedIds =
      cacheState?.itemsAdministered ?? responses.map((r) => r.itemId);
    const currentTheta =
      cacheState?.theta ?? lastDbResponse?.thetaAfter ?? -0.5;
    const currentSe = cacheState?.se ?? lastDbResponse?.seAfter ?? 1.0;

    // 5. Chọn kỹ năng tiếp theo (Round-robin)
    const nextSkill = this.catEngineService.pickNextSkill(
      cacheState?.lastSkillPicked ?? null,
    );

    // 6. Lấy danh sách Top-5 ứng viên gần theta nhất trong biên độ khó hợp lệ [-4, +4]
    const topNItems = this.configService.get<number>('cat.topNItems') ?? 5;
    const itemBMin = this.configService.get<number>('cat.itemBMin') ?? -4.0;
    const itemBMax = this.configService.get<number>('cat.itemBMax') ?? 4.0;
    const candidates = await this.itemRepository.findForCAT(
      nextSkill,
      usedIds,
      currentTheta,
      topNItems,
      itemBMin,
      itemBMax,
    );

    // 7. Chọn ngẫu nhiên đều 1 câu từ Top-5
    const selectedItem = this.catEngineService.selectNextItem(candidates);
    if (!selectedItem) {
      // Hết câu hỏi phù hợp trong ngân hàng đề -> hoàn tất phiên thi với ITEM_BANK_BOUNDARY
      await this.computeResultUseCase.execute(
        session.id,
        currentTheta,
        currentSe,
        StoppingReason.ITEM_BANK_BOUNDARY as any,
      );
      await this.cacheService.deleteState(session.id);

      return {
        kind: 'finished',
        reason: 'ITEM_BANK_BOUNDARY',
        sessionId: session.id,
      };
    }

    // 8. Cập nhật state machine sang WAITING_FOR_ANSWER
    await this.cacheService.setState(sessionId, {
      state: 'WAITING_FOR_ANSWER',
      currentItemId: selectedItem.id,
      theta: currentTheta,
      se: currentSe,
      lastSkillPicked: nextSkill,
      itemsAdministered: usedIds,
      lastUpdated: new Date().toISOString(),
    });

    return {
      kind: 'item',
      session: sessionMeta,
      item: this.formatItemForStudent(selectedItem),
    };
  }

  @Post(':id/responses')
  @Roles(UserRole.STUDENT)
  @ApiOkResponse({ type: SubmitSessionResponseDto })
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
      accepted: true,
      shouldStop: result.shouldStop,
      stoppingReason: result.stoppingReason,
    };
  }

  @Get(':id/resume')
  @Roles(UserRole.STUDENT)
  @ApiOkResponse({ type: ResumeSessionResponseDto })
  async resumeSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertSessionOwnership(sessionId, user);
    const result = await this.resumeSessionUseCase.execute(sessionId);
    return {
      ...result,
      currentItem: result.currentItem
        ? this.formatItemForStudent(result.currentItem)
        : null,
    };
  }

  @Get(':id/result')
  @ApiOkResponse({ type: SessionResultDto })
  async getResult(
    @Param('id') sessionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.getSessionResultUseCase.execute(sessionId, user.sub, user.role);
  }

  @Get(':id/review')
  @Roles(UserRole.STUDENT)
  @ApiOkResponse({ type: ReviewEntryDto, isArray: true })
  async getReview(
    @Param('id') sessionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.getSessionReviewUseCase.execute(sessionId, user.sub, user.role);
  }

  private async assertSessionOwnership(sessionId: string, user: JwtPayload) {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new NotFoundException('Không tìm thấy phiên làm bài');
    }
    // WP-9.1 / K6: Chỉ chính sinh viên chủ sở hữu mới được thao tác phiên làm bài
    if (user.role !== UserRole.STUDENT || session.studentId !== user.sub) {
      throw new ForbiddenException(
        'Bạn không có quyền thao tác trên phiên làm bài này',
      );
    }
    return session;
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
