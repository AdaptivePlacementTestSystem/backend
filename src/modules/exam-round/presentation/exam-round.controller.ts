import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiQuery,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  participantsResponse,
  roundRecord,
  roundListRecord,
  updateRound,
} from './admin-exam.schemas';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../../shared/decorators/current-user.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { AdminExamRoundsUseCase } from '../application/use-cases/admin-exam-rounds.use-case';
import { CreateExamRoundDto } from '../application/dto/create-exam-round.dto';
import { UpdateExamRoundDto } from '../application/dto/update-exam-round.dto';
import { ParticipantsQueryDto } from '../application/dto/participants-query.dto';
import { ListRoundParticipantsUseCase } from '../application/use-cases/list-round-participants.use-case';
import { GetStudentExamRoundsUseCase } from '../application/use-cases/get-student-exam-rounds.use-case';
import { GetExamRoundDetailUseCase } from '../application/use-cases/get-exam-round-detail.use-case';
import { GetCurrentRoundSessionUseCase } from '../../test-session/application/use-cases/get-current-round-session.use-case';

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

@ApiBearerAuth()
@Controller('exam-rounds')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExamRoundController {
  constructor(
    private readonly adminExamRoundsUseCase: AdminExamRoundsUseCase,
    private readonly getStudentExamRoundsUseCase: GetStudentExamRoundsUseCase,
    private readonly getExamRoundDetailUseCase: GetExamRoundDetailUseCase,
    private readonly getCurrentRoundSessionUseCase: GetCurrentRoundSessionUseCase,
    private readonly listRoundParticipantsUseCase: ListRoundParticipantsUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ schema: { type: 'array', items: roundListRecord } })
  @Roles(UserRole.ADMIN)
  list() {
    return this.adminExamRoundsUseCase.list();
  }

  @Post()
  @ApiCreatedResponse({ schema: roundRecord })
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateExamRoundDto, @CurrentUser() user: JwtPayload) {
    return this.adminExamRoundsUseCase.create(dto, user.sub);
  }

  @Patch(':id')
  @ApiBody({ schema: updateRound })
  @ApiOkResponse({ schema: roundRecord })
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExamRoundDto,
  ) {
    return this.adminExamRoundsUseCase.update(id, dto);
  }

  @Post(':id/publish')
  @ApiCreatedResponse({ schema: roundRecord })
  @Roles(UserRole.ADMIN)
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminExamRoundsUseCase.publish(id);
  }

  @Post(':id/close')
  @ApiCreatedResponse({ schema: roundRecord })
  @Roles(UserRole.ADMIN)
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminExamRoundsUseCase.close(id);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOkResponse({ type: StudentExamRoundResponseDto, isArray: true })
  @Roles(UserRole.STUDENT)
  async getMyExamRounds(@CurrentUser() user: JwtPayload) {
    return this.getStudentExamRoundsUseCase.execute(user.sub);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOkResponse({ type: ExamRoundDetailResponseDto })
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  async getExamRoundDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.getExamRoundDetailUseCase.execute(id, user.sub, user.role);
  }

  @Get(':id/participants')
  @ApiOkResponse({ schema: participantsResponse })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED'],
  })
  @ApiQuery({
    name: 'page',
    required: false,
    schema: { type: 'integer', minimum: 1 },
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @Roles(UserRole.ADMIN)
  listParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ParticipantsQueryDto,
  ) {
    return this.listRoundParticipantsUseCase.execute(id, query);
  }

  @Delete(':id/participants/:studentId')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { removed: { type: 'boolean' } },
    },
  })
  @Roles(UserRole.ADMIN)
  removeParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.adminExamRoundsUseCase.removeParticipant(id, studentId);
  }

  @Get(':id/participants/export')
  @ApiOkResponse({
    content: {
      'text/csv': { schema: { type: 'string', format: 'binary' } },
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @Roles(UserRole.ADMIN)
  async exportParticipants(
    @Param('id', ParseUUIDPipe) id: string,
    @Query()
    query: {
      format?: string;
      status?: string;
      q?: string;
      studentIds?: string;
    },
    @Res() res: Response,
  ) {
    const result = await this.listRoundParticipantsUseCase.export(id, query);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    return res.send(result.data);
  }

  @Get(':id/session/current')
  @ApiBearerAuth()
  @ApiOkResponse({ type: CurrentRoundSessionResponseDto })
  @Roles(UserRole.STUDENT)
  async getCurrentSession(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.getCurrentRoundSessionUseCase.execute(id, user.sub, user.role);
  }
}
