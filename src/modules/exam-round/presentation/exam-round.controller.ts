import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../../shared/decorators/current-user.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { GetStudentExamRoundsUseCase } from '../application/use-cases/get-student-exam-rounds.use-case';
import { GetExamRoundDetailUseCase } from '../application/use-cases/get-exam-round-detail.use-case';
import { GetCurrentRoundSessionUseCase } from '../../test-session/application/use-cases/get-current-round-session.use-case';
import { ListExamRoundsUseCase } from '../application/use-cases/list-exam-rounds.use-case';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

class ExamRoundSummaryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() status: string;
  @ApiProperty() effectiveStatus: string;
  @ApiProperty({ format: 'date-time' }) opensAt: string;
  @ApiProperty({ format: 'date-time' }) closesAt: string;
  @ApiProperty() durationMinutes: number;
  @ApiProperty() participantCount: number;
  @ApiProperty() sessionCount: number;
}

class ExamRoundDetailResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ format: 'date-time' }) opensAt: string;
  @ApiProperty({ format: 'date-time' }) closesAt: string;
  @ApiProperty() durationMinutes: number;
  @ApiProperty() status: string;
  @ApiProperty() effectiveStatus: string;
  @ApiPropertyOptional({
    enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'],
  })
  sessionStatus?: string;
  @ApiPropertyOptional() sessionId?: string;
  @ApiPropertyOptional() activeSessionId?: string;
}
class CurrentRoundItemDto {
  @ApiProperty() id: string;
  @ApiProperty() content: string;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  options: Record<string, string>;
  @ApiProperty() skill: string;
}
class CurrentRoundSessionResponseDto {
  @ApiProperty({
    enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'],
  })
  status: string;
  @ApiPropertyOptional() sessionId?: string;
  @ApiPropertyOptional() examRoundId?: string;
  @ApiPropertyOptional({ format: 'date-time' }) startedAt?: string;
  @ApiPropertyOptional({ format: 'date-time' }) expiresAt?: string;
  @ApiPropertyOptional({ format: 'date-time' }) serverTime?: string;
  @ApiPropertyOptional() itemCount?: number;
  @ApiPropertyOptional() maxItems?: number;
  @ApiPropertyOptional({ type: CurrentRoundItemDto, nullable: true })
  currentItem?: CurrentRoundItemDto | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  completedAt?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) stoppingReason?:
    string | null;
  @ApiPropertyOptional() isExpired?: boolean;
}

class StudentExamRoundResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ format: 'date-time' }) opensAt: string;
  @ApiProperty({ format: 'date-time' }) closesAt: string;
  @ApiProperty() durationMinutes: number;
  @ApiProperty() status: string;
  @ApiProperty() effectiveStatus: string;
  @ApiProperty({
    enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'],
  })
  sessionStatus: string;
  @ApiPropertyOptional() sessionId?: string;
  @ApiProperty({ type: String, nullable: true }) scoreCefr: string | null;
}

@Controller('exam-rounds')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExamRoundController {
  constructor(
    private readonly getStudentExamRoundsUseCase: GetStudentExamRoundsUseCase,
    private readonly getExamRoundDetailUseCase: GetExamRoundDetailUseCase,
    private readonly getCurrentRoundSessionUseCase: GetCurrentRoundSessionUseCase,
    private readonly listExamRoundsUseCase: ListExamRoundsUseCase,
  ) {}

  @Get()
  @ApiBearerAuth()
  @ApiOkResponse({ type: ExamRoundSummaryResponseDto, isArray: true })
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async listExamRounds() {
    return this.listExamRoundsUseCase.execute();
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOkResponse({ type: StudentExamRoundResponseDto, isArray: true })
  @Roles(UserRole.STUDENT, UserRole.ADMIN)
  async getMyExamRounds(@CurrentUser() user: JwtPayload) {
    return this.getStudentExamRoundsUseCase.execute(user.sub);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOkResponse({ type: ExamRoundDetailResponseDto })
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  async getExamRoundDetail(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.getExamRoundDetailUseCase.execute(id, user.sub, user.role);
  }

  @Get(':id/session/current')
  @ApiBearerAuth()
  @ApiOkResponse({ type: CurrentRoundSessionResponseDto })
  @Roles(UserRole.STUDENT, UserRole.ADMIN)
  async getCurrentSession(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.getCurrentRoundSessionUseCase.execute(id, user.sub, user.role);
  }
}
