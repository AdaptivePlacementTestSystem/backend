import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ItemBatchJobStore } from '../infrastructure/item-batch-job.store';
import { RunBatchChecksUseCase } from './run-batch-checks.use-case';
import { ProcessAiBatchUseCase } from './process-ai-batch.use-case';

const LEASE_SECONDS = 90;
const MAX_ATTEMPTS = 3;

@Injectable()
export class ItemCheckWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ItemCheckWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopped = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: ItemBatchJobStore,
    private readonly checks: RunBatchChecksUseCase,
    private readonly generation: ProcessAiBatchUseCase,
  ) {}

  onModuleInit(): void {
    if (
      process.env.ITEM_BATCH_WORKER_ENABLED === 'false' ||
      (process.env.NODE_ENV === 'test' &&
        process.env.ITEM_BATCH_WORKER_ENABLED !== 'true')
    )
      return;
    this.timer = setInterval(() => this.start(), 5000);
    this.timer.unref();
    this.start();
  }
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  private start(): void {
    if (this.stopped || this.running) return;
    this.running = this.processOne()
      .catch(() => this.logger.error('Không thể xử lý tác vụ kiểm tra lô.'))
      .finally(() => {
        this.running = undefined;
      });
  }
  async processOne(): Promise<void> {
    const job = await this.jobs.claim(LEASE_SECONDS, MAX_ATTEMPTS);
    if (!job) return;
    let renewing = false;
    const heartbeat = setInterval(() => {
      if (renewing) return;
      renewing = true;
      void this.jobs
        .renew(job.id, job.leaseToken, LEASE_SECONDS)
        .catch(() => false)
        .finally(() => {
          renewing = false;
        });
    }, 20000);
    heartbeat.unref();
    try {
      const batch = await this.prisma.itemBatch.findUnique({
        where: { id: job.batchId },
        select: { status: true, source: true },
      });
      const expected = job.kind === 'GENERATE' ? 'GENERATING' : 'CHECKING';
      if (!batch || batch.status !== expected) {
        await this.jobs.finish(job.id, job.leaseToken);
        return;
      }
      const lease = {
        jobId: job.id,
        token: job.leaseToken,
        batchId: job.batchId,
      };
      if (job.kind === 'GENERATE')
        await this.generation.execute(job.batchId, lease);
      else
        await this.checks.execute(
          job.batchId,
          batch.source === 'IMPORTED' ? 'C2' : 'C1',
          lease,
        );
      await this.jobs.finish(job.id, job.leaseToken);
    } catch (error) {
      const code =
        error instanceof Error &&
        [
          'AI_NOT_CONFIGURED',
          'INSUFFICIENT_REFERENCE_ITEMS',
          'AI_OUTPUT_INVALID',
          'AI_BUDGET_EXCEEDED',
        ].includes(error.message)
          ? (error.message as
              | 'AI_NOT_CONFIGURED'
              | 'INSUFFICIENT_REFERENCE_ITEMS'
              | 'AI_OUTPUT_INVALID'
              | 'AI_BUDGET_EXCEEDED')
          : 'PROCESSING_FAILED';
      await this.jobs.fail(
        job.id,
        job.leaseToken,
        30,
        code === 'AI_BUDGET_EXCEEDED' ? job.attempts : MAX_ATTEMPTS,
        code,
      );
    } finally {
      clearInterval(heartbeat);
    }
  }
}
