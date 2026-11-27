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
@Roles(UserRole.TEACHER, UserRole.ADMIN)
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
    @Body()
    body: {
      action: 'APPROVE' | 'REJECT' | 'CONFIRM' | 'REMOVE';
      comment?: string;
    },
  ) {
    return this.review.decide(user.sub, id, body?.action, body?.comment);
  }
  @Post(':id/confirm-all')
  confirmAll(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.review.confirmAll(user.sub, id);
  }
}

@Controller('teacher')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TEACHER, UserRole.ADMIN)
export class TeacherTasksController {
  constructor(private readonly review: TeacherReviewUseCase) {}

  @Get('tasks/reviews')
  async reviews(@CurrentUser() user: JwtPayload) {
    return (await this.review.list(user.sub)).filter(
      (item) => item.role === 'A',
    );
  }
  @Get('tasks/reviews/:batchId')
  async reviewsByBatch(
    @CurrentUser() user: JwtPayload,
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
  ) {
    return (await this.reviews(user)).filter(
      (item) => item.batchId === batchId,
    );
  }
  @Get('tasks/confirms')
  async confirms(@CurrentUser() user: JwtPayload) {
    return (await this.review.list(user.sub)).filter(
      (item) => item.role === 'B',
    );
  }
  @Get('tasks/confirms/:batchId')
  async confirmsByBatch(
    @CurrentUser() user: JwtPayload,
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
  ) {
    return (await this.confirms(user)).filter(
      (item) => item.batchId === batchId,
    );
  }
  @Patch('items/:id')
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
  @Post('items/:id/approve')
  approve(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body?: { comment?: string },
  ) {
    return this.review.decide(user.sub, id, 'APPROVE', body?.comment);
  }
  @Post('items/:id/reject')
  reject(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body?: { comment?: string },
  ) {
    return this.review.decide(user.sub, id, 'REJECT', body?.comment);
  }
  @Post('items/:id/confirm')
  confirm(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body?: { comment?: string },
  ) {
    return this.review.decide(user.sub, id, 'CONFIRM', body?.comment);
  }
  @Post('items/:id/remove')
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body?: { comment?: string },
  ) {
    return this.review.decide(user.sub, id, 'REMOVE', body?.comment);
  }
  @Post('tasks/confirms/:batchId/confirm-all')
  confirmAll(
    @CurrentUser() user: JwtPayload,
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
  ) {
    return this.review.confirmAll(user.sub, batchId);
  }
}
