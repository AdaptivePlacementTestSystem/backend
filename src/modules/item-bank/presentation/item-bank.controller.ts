import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiQuery,
} from '@nestjs/swagger';
import {
  CEFRLevel,
  ErrorCode,
  ItemBatchSource,
  ItemStatus,
  Skill,
} from '@apt/shared-types';
import {
  CurrentUser,
  type JwtPayload,
} from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { ItemService } from '../application/services/item.service';
import { TeacherItemAccess } from '../application/services/teacher-item-access';
import { GenerateExplanationDto } from '../application/use-cases/generate-explanation.use-case';
import {
  ExplanationResponseDto,
  ItemDetailResponseDto,
  PagedItemsResponseDto,
} from './item-response.dto';

/**
 * Ngân hàng câu hỏi — CHỈ XEM (DC-32, #106).
 * UCGV02 / BR-16: TEACHER chỉ thấy và truy cập câu được phân công (reviewerId hoặc batch.confirmerId). ADMIN xem toàn bộ.
 */
@Controller('items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemBankController {
  constructor(
    private readonly itemService: ItemService,
    private readonly access?: TeacherItemAccess,
  ) {}

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: ItemStatus })
  @ApiQuery({ name: 'skill', required: false, enum: Skill })
  @ApiQuery({ name: 'cefr', required: false, enum: CEFRLevel })
  @ApiQuery({ name: 'source', required: false, enum: ItemBatchSource })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: PagedItemsResponseDto })
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async listItems(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: ItemStatus,
    @Query('skill') skill?: Skill,
    @Query('cefr') cefr?: CEFRLevel,
    @Query('source') source?: ItemBatchSource,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
    const limitNum = Math.max(1, parseInt(limit || '10', 10) || 10);
    const offset = (pageNum - 1) * limitNum;

    const visibleIds =
      this.access && user?.role === UserRole.TEACHER
        ? await this.access.allowedIds(user.sub)
        : undefined;
    const assignedTeacherId =
      !this.access && user?.role === UserRole.TEACHER ? user.sub : undefined;

    const result = await this.itemService.listItems({
      status,
      skill,
      cefrTarget: cefr,
      source,
      q: q?.trim() || undefined,
      visibleIds,
      assignedTeacherId,
      limit: limitNum,
      offset,
    });
    return result ? { data: result.items, total: result.total } : result;
  }

  @Post('generate-explanation')
  @ApiCreatedResponse({ type: ExplanationResponseDto })
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async generateExplanation(@Body() dto: GenerateExplanationDto) {
    return this.itemService.generateExplanation(dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: ItemDetailResponseDto })
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getItem(
    @Param('id') idOrUser: string | JwtPayload,
    @CurrentUser() userOrId?: JwtPayload | string,
  ) {
    const user = (
      typeof idOrUser === 'object' ? idOrUser : userOrId
    ) as JwtPayload;
    const id = (typeof idOrUser === 'string' ? idOrUser : userOrId) as string;

    if (this.access && user?.role === UserRole.TEACHER) {
      await this.access.assertAllowed(user.sub, id);
    }

    const item = await this.itemService.getItem(id);
    if (!item) {
      throw new NotFoundException('Không tìm thấy câu hỏi');
    }
    if (
      !this.access &&
      user?.role === UserRole.TEACHER &&
      item.reviewerId !== user.sub &&
      item.confirmerId !== user.sub
    ) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_ASSIGNED,
        message: 'Bạn không được phân công câu hỏi này (NOT_ASSIGNED)',
      });
    }
    return item;
  }
}
