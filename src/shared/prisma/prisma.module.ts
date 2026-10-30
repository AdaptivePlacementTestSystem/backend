import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global module — import 1 lần ở AppModule, khả dụng ở mọi nơi.
 * Không cần import PrismaModule lại ở từng module con.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
