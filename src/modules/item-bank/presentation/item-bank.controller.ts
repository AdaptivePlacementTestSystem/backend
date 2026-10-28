import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
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
 * đã bị gỡ; mã cũ giữ ở application/use-cases/_legacy. TODO: GV chỉ thấy câu được giao (UCGV02, BR-21).
 */
@Controller('items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemBankController {
  constructor(private readonly itemService: ItemService) {}

  @Get()
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async listItems(@Query('status') status?: ItemStatus, @Query('skill') skill?: Skill) {
    return this.itemService.listItems({ status, skill });
  }

  @Post('generate-explanation')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async generateExplanation(@Body() dto: GenerateExplanationDto) {
    return this.itemService.generateExplanation(dto);
  }

  @Get(':id')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getItem(@Param('id') id: string) {
    return this.itemService.getItem(id);
  }
}
