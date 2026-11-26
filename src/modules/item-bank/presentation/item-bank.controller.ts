import {
  CurrentUser,
  type JwtPayload,
} from '../../../shared/decorators/current-user.decorator';
import { TeacherItemAccess } from '../application/services/teacher-item-access';
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ItemService } from '../application/services/item.service';
import { GenerateExplanationDto } from '../application/use-cases/generate-explanation.use-case';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { Skill } from '../domain/enums/skill.enum';
import { ItemStatus } from '../domain/enums/item-status.enum';

/**
 * Ngân hàng câu hỏi — CHỈ XEM (DC-32, #106). Các endpoint POST/PUT/DELETE/clone/approve/reject
 * đã bị gỡ; mã cũ giữ ở application/use-cases/_legacy.
 */
@Controller('items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemBankController {
  constructor(
    private readonly itemService: ItemService,
    private readonly access: TeacherItemAccess,
  ) {}

  @Get()
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async listItems(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: ItemStatus,
    @Query('skill') skill?: Skill,
  ) {
    const visibleIds =
      user.role === UserRole.TEACHER
        ? await this.access.allowedIds(user.sub)
        : undefined;
    return this.itemService.listItems({ status, skill, visibleIds });
  }

  @Post('generate-explanation')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async generateExplanation(@Body() dto: GenerateExplanationDto) {
    return this.itemService.generateExplanation(dto);
  }

  @Get(':id')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getItem(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (user.role === UserRole.TEACHER)
      await this.access.assertAllowed(user.sub, id);
    return this.itemService.getItem(id);
  }
}
