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
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async listExamRounds() {
    return this.listExamRoundsUseCase.execute();
  }

  @Get('mine')
  @Roles(UserRole.STUDENT, UserRole.ADMIN)
  async getMyExamRounds(@CurrentUser() user: JwtPayload) {
    return this.getStudentExamRoundsUseCase.execute(user.sub);
  }

  @Get(':id')
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  async getExamRoundDetail(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.getExamRoundDetailUseCase.execute(id, user.sub, user.role);
  }

  @Get(':id/session/current')
  @Roles(UserRole.STUDENT, UserRole.ADMIN)
  async getCurrentSession(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.getCurrentRoundSessionUseCase.execute(id, user.sub, user.role);
  }
}
