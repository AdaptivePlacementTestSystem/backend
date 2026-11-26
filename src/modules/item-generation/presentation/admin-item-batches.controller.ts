import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { GetAdminBatchUseCase } from '../application/get-admin-batch.use-case';

@Controller('item-batches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminItemBatchesController {
  constructor(private readonly getAdminBatch: GetAdminBatchUseCase) {}

  @Get()
  @Roles(UserRole.ADMIN)
  list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.getAdminBatch.list(
      parsePagination(page, 1, 100000),
      parsePagination(limit, 20, 100),
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  getDetail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.getAdminBatch.execute(
      id,
      parsePagination(page, 1, 100000),
      parsePagination(limit, 20, 100),
    );
  }
}

function parsePagination(
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value))
    throw new BadRequestException('Phân trang không hợp lệ');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result > max)
    throw new BadRequestException('Phân trang không hợp lệ');
  return result;
}
