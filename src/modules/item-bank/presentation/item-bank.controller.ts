import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ItemService } from '../application/services/item.service';
import { GenerateExplanationDto } from '../application/use-cases/generate-explanation.use-case';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import {
  CurrentUser,
  JwtPayload,
} from '../../../shared/decorators/current-user.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import {
  Skill,
  CEFRLevel,
  ItemStatus,
  ItemBatchSource,
  ErrorCode,
} from '@apt/shared-types';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiQuery,
} from '@nestjs/swagger';
import {
  ExplanationResponseDto,
  ItemDetailResponseDto,
  PagedItemsResponseDto,
} from './item-response.dto';

/**
 * Ngân hàng câu hỏi — CHỈ XEM (DC-32, #106).
 * UCGV02 / BR-16: TEACHER chỉ thấy và truy cập câu được phân công (reviewerId hoặc confirmerId). ADMIN xem toàn bộ.
 */
@Controller('items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemBankController {
  constructor(private readonly itemService: ItemService) {}

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

    // UCGV02 / BR-16: GV chỉ thấy câu được phân công (vai A hoặc B). Admin xem tất cả.
    const assignedTeacherId =
      user?.role === UserRole.TEACHER ? user.sub : undefined;

    const result = await this.itemService.listItems({
      status,
      skill,
      cefrTarget: cefr,
      source,
      q: q?.trim() || undefined,
      assignedTeacherId,
      limit: limitNum,
      offset,
    });
    return { data: result.items, total: result.total };
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
  async getItem(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const item = await this.itemService.getItem(id);
    if (!item) {
      throw new NotFoundException('Không tìm thấy câu hỏi');
    }
    // UCGV02 / BR-16: GV chỉ được xem chi tiết câu được phân công cho mình
    if (
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
