import { PrismaService } from '../../../shared/prisma/prisma.service';
import { assertJobLease, type JobLease } from './job-lease';

/** Reserve a call before sending any data; failed provider calls still consume budget. */
export async function reserveAiCall(
  prisma: PrismaService,
  batchId: string,
  lease?: JobLease,
): Promise<void> {
  if (lease && lease.batchId !== batchId) throw new Error('JOB_BATCH_MISMATCH');
  await prisma.$transaction(async (tx) => {
    await assertJobLease(tx, lease);
    const changed =
      await tx.$executeRaw`UPDATE item_batches SET ai_call_count = ai_call_count + 1, updated_at = now()
      WHERE id = ${batchId}::uuid AND ai_call_count < ai_call_limit`;
    if (changed !== 1) throw new Error('AI_BUDGET_EXCEEDED');
  });
}
