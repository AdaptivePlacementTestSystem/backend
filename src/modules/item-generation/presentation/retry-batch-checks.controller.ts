import {
  ConflictException,
  Controller,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { RunBatchChecksUseCase } from '../application/run-batch-checks.use-case';

@Controller('item-batches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RetryBatchChecksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runChecks: RunBatchChecksUseCase,
  ) {}
  @Post(':id/retry-generation')
  @Roles(UserRole.ADMIN)
  async retryGeneration(@Param('id', new ParseUUIDPipe()) id: string) {
    const batch = await this.prisma.itemBatch.findUnique({
      where: { id },
      select: { status: true, source: true },
    });
    if (!batch) throw new NotFoundException('Không tìm thấy lô');
    if (batch.source !== 'AI_GENERATED' || batch.status !== 'GENERATING')
      throw new ConflictException('Lô không chờ sinh câu');
    const updated = await this.prisma.itemBatchJob.updateMany({
      where: {
        batchId: id,
        kind: 'GENERATE',
        status: 'FAILED',
        lastError: { not: 'AI_BUDGET_EXCEEDED' },
      },
      data: {
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        lastError: null,
      },
    });
    if (updated.count !== 1)
      throw new ConflictException(
        'Tác vụ sinh câu đang chạy hoặc chưa cần thử lại',
      );
    return { status: 'GENERATING', jobStatus: 'PENDING' };
  }
  @Post(':id/retry-checks')
  @Roles(UserRole.ADMIN)
  async execute(@Param('id', new ParseUUIDPipe()) id: string) {
    const batch = await this.prisma.itemBatch.findUnique({
      where: { id },
      select: { status: true, source: true },
    });
    if (!batch) throw new NotFoundException('Không tìm thấy lô');
    if (batch.status !== 'CHECKING')
      throw new ConflictException('Lô không chờ kiểm tra');
    const job = await this.prisma.itemBatchJob.findUnique({
      where: { batchId_kind: { batchId: id, kind: 'CHECK' } },
    });
    if (job) {
      if (job.lastError === 'AI_BUDGET_EXCEEDED')
        throw new ConflictException({
          code: 'BATCH_BUDGET_EXCEEDED',
          message: 'Lô đã hết 250 lượt gọi AI.',
        });
      const updated = await this.prisma.itemBatchJob.updateMany({
        where: { id: job.id, status: 'FAILED' },
        data: {
          status: 'PENDING',
          attempts: 0,
          availableAt: new Date(),
          lastError: null,
        },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'Tác vụ kiểm tra đang chạy hoặc chưa cần thử lại',
        );
      return { status: 'CHECKING', jobStatus: 'PENDING' };
    }
    try {
      return await this.runChecks.execute(
        id,
        batch.source === 'IMPORTED' ? 'C2' : 'C1',
      );
    } catch {
      throw new ServiceUnavailableException(
        'Chưa hoàn tất kiểm tra. Kiểm tra cấu hình và dịch vụ AI rồi thử lại.',
      );
    }
  }
}
