import { ApiCreatedResponse } from '@nestjs/swagger';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CEFRLevel, Skill } from '@prisma/client';
import {
  CurrentUser,
  type JwtPayload,
} from '../../../shared/decorators/current-user.decorator';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { CreateAiBatchUseCase } from '../application/create-ai-batch.use-case';
@Controller('item-batches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CreateAiBatchController {
  constructor(private readonly create: CreateAiBatchUseCase) {}
  @ApiCreatedResponse({
    schema: { type: 'object', additionalProperties: true },
  })
  @Post('generate')
  @Roles(UserRole.ADMIN)
  generate(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      name?: string;
      skill: Skill;
      cefrTarget: CEFRLevel;
      topicTag?: string;
      count: number;
      operationId: string;
    },
  ) {
    return this.create.execute(user.sub, body);
  }
}
