import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type JobLease = { jobId: string; token: string; batchId: string };

/** Hold the lease row until the surrounding transaction commits its side effects. */
export async function assertJobLease(
  tx: Prisma.TransactionClient,
  lease?: JobLease,
): Promise<void> {
  if (!lease) return;
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM item_batch_jobs
    WHERE id = ${lease.jobId}::uuid AND batch_id = ${lease.batchId}::uuid AND status = 'RUNNING' AND lease_token = ${lease.token}::uuid AND lease_until > now()
    FOR UPDATE`;
  if (rows.length !== 1)
    throw new ConflictException('Tác vụ đã mất quyền xử lý');
}
