import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type JwtPayload,
} from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { TeacherReviewUseCase } from '../application/teacher-review.use-case';

@Controller('teacher-review')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TEACHER)
export class TeacherReviewController {
  constructor(private readonly review: TeacherReviewUseCase) {}
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.review.list(user.sub);
  }
  @Patch(':id')
  edit(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body()
    body: {
      content: string;
      options: Record<string, string>;
      correctAnswer: string;
      explanation: string;
    },
  ) {
    return this.review.edit(user.sub, id, body);
  }
  @Post(':id/decision')
  decide(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { action: 'APPROVE' | 'REJECT' | 'CONFIRM' | 'REMOVE' },
  ) {
    return this.review.decide(user.sub, id, body?.action);
  }
  @Post(':id/confirm-all')
  confirmAll(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.review.confirmAll(user.sub, id);
  }
}
