import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ItemService } from '../application/services/item.service';
import { GenerateExplanationDto } from '../application/use-cases/generate-explanation.use-case';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  CurrentUser,
  type JwtPayload,
} from '../../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { Skill } from '../domain/enums/skill.enum';
import { ItemStatus } from '../domain/enums/item-status.enum';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiQuery,
} from '@nestjs/swagger';
import {
  ExplanationResponseDto,
  ItemDetailResponseDto,
  ItemResponseDto,
} from './item-response.dto';

/**
 * Ngân hàng câu hỏi — CHỈ XEM (DC-32, #106). Các endpoint POST/PUT/DELETE/clone/approve/reject
 * đã bị gỡ; mã cũ giữ ở application/use-cases/_legacy.
 */
@Controller('items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemBankController {
  constructor(
    private readonly itemService: ItemService,
    private readonly prisma: PrismaService,
  ) {}

  private async teacherItemIds(userId: string): Promise<string[]> {
    const items = await this.prisma.item.findMany({
      where: {
        OR: [
          { reviewerId: userId },
          {
            confirmerId: userId,
            status: {
              in: ['FIRST_APPROVED', 'SECOND_APPROVED', 'FINAL_APPROVED'],
            },
          },
        ],
      },
      select: { id: true },
    });
    return items.map((item) => item.id);
  }

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: ItemStatus })
  @ApiQuery({ name: 'skill', required: false, enum: Skill })
  @ApiOkResponse({ type: ItemResponseDto, isArray: true })
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async listItems(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: ItemStatus,
    @Query('skill') skill?: Skill,
  ) {
    const visibleIds =
      user.role === UserRole.TEACHER
        ? await this.teacherItemIds(user.sub)
        : undefined;
    return this.itemService.listItems({ status, skill, visibleIds });
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
  async getItem(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (
      user.role === UserRole.TEACHER &&
      !(await this.teacherItemIds(user.sub)).includes(id)
    )
      throw new ForbiddenException('Câu hỏi không thuộc phân công');
    return this.itemService.getItem(id);
  }
}
