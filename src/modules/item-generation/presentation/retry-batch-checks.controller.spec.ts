import { describe, expect, it, vi } from 'vitest';
import { RetryBatchChecksController } from './retry-batch-checks.controller';

describe('retry item check', () => {
  function setup(job: unknown, updated = 1) {
    const db = {
      itemBatch: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ status: 'CHECKING', source: 'IMPORTED' }),
      },
      itemBatchJob: {
        findUnique: vi.fn().mockResolvedValue(job),
        updateMany: vi.fn().mockResolvedValue({ count: updated }),
      },
    };
    const checks = {
      execute: vi.fn().mockResolvedValue({ status: 'READY_TO_ASSIGN' }),
    };
    return {
      db,
      checks,
      controller: new RetryBatchChecksController(db as never, checks as never),
    };
  }
  it('requeues a failed job instead of running AI in the request', async () => {
    const { db, checks, controller } = setup({ id: 'job', status: 'FAILED' });
    await expect(controller.execute('batch')).resolves.toEqual({
      status: 'CHECKING',
      jobStatus: 'PENDING',
    });
    expect(db.itemBatchJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job', status: 'FAILED' } }),
    );
    expect(checks.execute).not.toHaveBeenCalled();
  });
  it('rejects when a job is already pending or another request requeued it', async () => {
    const { controller } = setup({ id: 'job', status: 'RUNNING' }, 0);
    await expect(controller.execute('batch')).rejects.toThrow();
  });
  it('retains the existing legacy path when no durable job exists', async () => {
    const { checks, controller } = setup(null);
    await controller.execute('batch');
    expect(checks.execute).toHaveBeenCalledWith('batch', 'C2');
  });
});
