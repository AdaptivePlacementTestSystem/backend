import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../../shared/decorators/current-user.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { GetTeacherReviewTasksUseCase } from '../application/use-cases/review/get-teacher-review-tasks.use-case';
import { GetBatchItemsForReviewUseCase } from '../application/use-cases/review/get-batch-items-for-review.use-case';
import { EditItemUseCase } from '../application/use-cases/review/edit-item.use-case';
import { ReviewItemUseCase } from '../application/use-cases/review/review-item.use-case';
import { GetTeacherConfirmTasksUseCase } from '../application/use-cases/review/get-teacher-confirm-tasks.use-case';
import { GetBatchItemsForConfirmUseCase } from '../application/use-cases/review/get-batch-items-for-confirm.use-case';
import { ConfirmItemUseCase } from '../application/use-cases/review/confirm-item.use-case';
import { ConfirmAllItemsUseCase } from '../application/use-cases/review/confirm-all-items.use-case';
import {
  EditItemDto,
  ReviewDecisionDto,
  ConfirmDecisionDto,
} from '../application/dto/teacher-review.dto';

@Controller('teacher')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeacherReviewController {
  constructor(
    private readonly getTeacherReviewTasksUseCase: GetTeacherReviewTasksUseCase,
    private readonly getBatchItemsForReviewUseCase: GetBatchItemsForReviewUseCase,
    private readonly editItemUseCase: EditItemUseCase,
    private readonly reviewItemUseCase: ReviewItemUseCase,
    private readonly getTeacherConfirmTasksUseCase: GetTeacherConfirmTasksUseCase,
    private readonly getBatchItemsForConfirmUseCase: GetBatchItemsForConfirmUseCase,
    private readonly confirmItemUseCase: ConfirmItemUseCase,
    private readonly confirmAllItemsUseCase: ConfirmAllItemsUseCase,
  ) {}

  // S33: Hộp việc - Cần duyệt (GV vai A)
  @Get('tasks/reviews')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getReviewTasks(@CurrentUser() user: JwtPayload) {
    return this.getTeacherReviewTasksUseCase.execute(user.sub);
  }

  // S11: Duyệt các câu trong lô (GV vai A)
  @Get('tasks/reviews/:batchId')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getBatchItemsForReview(
    @Param('batchId') batchId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.getBatchItemsForReviewUseCase.execute(user.sub, batchId);
  }

  // S34: Hộp việc - Cần xác nhận (GV vai B)
  @Get('tasks/confirms')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getConfirmTasks(@CurrentUser() user: JwtPayload) {
    return this.getTeacherConfirmTasksUseCase.execute(user.sub);
  }

  // S35: Thẩm định các câu trong lô (GV vai B)
  @Get('tasks/confirms/:batchId')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getBatchItemsForConfirm(
    @Param('batchId') batchId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.getBatchItemsForConfirmUseCase.execute(user.sub, batchId);
  }

  // S35: Xác nhận tất cả câu còn lại trong lô (GV vai B)
  @Post('tasks/confirms/:batchId/confirm-all')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async confirmAllRemaining(
    @Param('batchId') batchId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.confirmAllItemsUseCase.execute(user.sub, batchId);
  }

  // UCGV04: Chỉnh sửa câu hỏi (GV vai A)
  @Patch('items/:id')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async editItem(
    @Param('id') id: string,
    @Body() dto: EditItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.editItemUseCase.execute(user.sub, id, dto);
  }

  // UCGV14: Duyệt câu hỏi (GV vai A) -> FIRST_APPROVED
  @Post('items/:id/approve')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async approveItem(
    @Param('id') id: string,
    @Body() dto: { comment?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.reviewItemUseCase.execute(user.sub, id, 'APPROVE', dto.comment);
  }

  // UCGV14: Từ chối câu hỏi (GV vai A) -> REJECTED
  @Post('items/:id/reject')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async rejectItem(
    @Param('id') id: string,
    @Body() dto: { comment?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.reviewItemUseCase.execute(user.sub, id, 'REJECT', dto.comment);
  }

  // UCGV15: Xác nhận câu hỏi (GV vai B) -> SECOND_APPROVED
  @Post('items/:id/confirm')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async confirmItem(
    @Param('id') id: string,
    @Body() dto: { comment?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.confirmItemUseCase.execute(user.sub, id, 'CONFIRM', dto.comment);
  }

  // UCGV15: Loại bỏ câu hỏi (GV vai B) -> REJECTED
  @Post('items/:id/remove')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async removeItem(
    @Param('id') id: string,
    @Body() dto: { comment?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.confirmItemUseCase.execute(user.sub, id, 'REMOVE', dto.comment);
  }
}
