import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — wrapper duy nhất của PrismaClient trong toàn app.
 * Được import qua PrismaModule (global) — không inject PrismaClient trực tiếp ở nơi khác.
 *
 * Đặt tại shared/ vì được dùng bởi tất cả module infrastructure layer.
 * Domain layer KHÔNG biết về Prisma (chỉ biết IRepository interface).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
