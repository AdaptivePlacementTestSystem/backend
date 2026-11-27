import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export type ClaimedItemJob = {
  id: string;
  batchId: string;
  kind: 'GENERATE' | 'CHECK';
  leaseToken: string;
  attempts: number;
};

/** PostgreSQL owns the queue; expired leases can be claimed by another worker. */
@Injectable()
export class ItemBatchJobStore {
  constructor(private readonly prisma: PrismaService) {}

  async claim(
    leaseSeconds: number,
    maxAttempts: number,
  ): Promise<ClaimedItemJob | null> {
    if (
      !Number.isInteger(leaseSeconds) ||
      leaseSeconds < 1 ||
      !Number.isInteger(maxAttempts) ||
      maxAttempts < 1
    )
      throw new Error('INVALID_JOB_CONFIGURATION');
    const token = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE item_batch_jobs SET status = 'FAILED', lease_token = NULL, lease_until = NULL, last_error = 'LEASE_EXPIRED', updated_at = now()
        WHERE status = 'RUNNING' AND lease_until <= now() AND attempts >= ${maxAttempts}`;
      const jobs = await tx.$queryRaw<ClaimedItemJob[]>`
        WITH selected AS (
          SELECT id FROM item_batch_jobs
          WHERE attempts < ${maxAttempts} AND ((status = 'PENDING' AND available_at <= now()) OR (status = 'RUNNING' AND lease_until <= now()))
          ORDER BY available_at, created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE item_batch_jobs j SET status = 'RUNNING', attempts = j.attempts + 1,
          lease_token = ${token}::uuid, lease_until = now() + ${leaseSeconds} * interval '1 second', updated_at = now()
        FROM selected WHERE j.id = selected.id
        RETURNING j.id, j.batch_id AS "batchId", j.kind, j.lease_token AS "leaseToken", j.attempts`;
      return jobs[0] ?? null;
    });
  }

  async renew(id: string, token: string, seconds: number): Promise<boolean> {
    if (!Number.isInteger(seconds) || seconds < 1)
      throw new Error('INVALID_JOB_CONFIGURATION');
    return (
      (await this.prisma
        .$executeRaw`UPDATE item_batch_jobs SET lease_until = now() + ${seconds} * interval '1 second', updated_at = now()
      WHERE id = ${id}::uuid AND status = 'RUNNING' AND lease_token = ${token}::uuid AND lease_until > now()`) ===
      1
    );
  }

  async finish(id: string, token: string): Promise<boolean> {
    return (
      (await this.prisma
        .$executeRaw`UPDATE item_batch_jobs SET status = 'DONE', lease_token = NULL, lease_until = NULL, last_error = NULL, updated_at = now()
      WHERE id = ${id}::uuid AND status = 'RUNNING' AND lease_token = ${token}::uuid AND lease_until > now()`) ===
      1
    );
  }

  async fail(
    id: string,
    token: string,
    retrySeconds: number,
    maxAttempts: number,
    errorCode:
      | 'PROCESSING_FAILED'
      | 'AI_NOT_CONFIGURED'
      | 'INSUFFICIENT_REFERENCE_ITEMS'
      | 'AI_OUTPUT_INVALID'
      | 'AI_BUDGET_EXCEEDED' = 'PROCESSING_FAILED',
  ): Promise<boolean> {
    if (
      !Number.isInteger(retrySeconds) ||
      retrySeconds < 0 ||
      !Number.isInteger(maxAttempts) ||
      maxAttempts < 1
    )
      throw new Error('INVALID_JOB_CONFIGURATION');
    return (
      (await this.prisma
        .$executeRaw`UPDATE item_batch_jobs SET status = CASE WHEN attempts >= ${maxAttempts} THEN 'FAILED' ELSE 'PENDING' END,
      lease_token = NULL, lease_until = NULL, available_at = now() + ${retrySeconds} * interval '1 second', last_error = ${errorCode}, updated_at = now()
      WHERE id = ${id}::uuid AND status = 'RUNNING' AND lease_token = ${token}::uuid AND lease_until > now()`) ===
      1
    );
  }
}
