import { describe, expect, it, vi } from 'vitest';
import { ItemCheckWorker } from './item-check-worker';

describe('item check worker', () => {
  const job = {
    id: 'job',
    batchId: 'batch',
    leaseToken: 'token',
    kind: 'CHECK',
    attempts: 1,
  };
  function setup(status = 'CHECKING') {
    const prisma = {
      itemBatch: {
        findUnique: vi.fn().mockResolvedValue({ status, source: 'IMPORTED' }),
      },
    };
    const jobs = {
      claim: vi.fn().mockResolvedValue(job),
      renew: vi.fn(),
      finish: vi.fn(),
      fail: vi.fn(),
    };
    const checks = {
      execute: vi.fn().mockResolvedValue({ status: 'READY_TO_ASSIGN' }),
    };
    return {
      jobs,
      checks,
      worker: new ItemCheckWorker(
        prisma as never,
        jobs as never,
        checks as never,
        {} as never,
      ),
    };
  }
  it('checks with the claimed lease and finishes the job', async () => {
    const { jobs, checks, worker } = setup();
    await worker.processOne();
    expect(checks.execute).toHaveBeenCalledWith('batch', 'C2', {
      jobId: 'job',
      batchId: 'batch',
      token: 'token',
    });
    expect(jobs.finish).toHaveBeenCalledWith('job', 'token');
  });
  it('schedules a retry on failure without reporting success', async () => {
    const { jobs, checks, worker } = setup();
    checks.execute.mockRejectedValueOnce(new Error('provider failed'));
    await worker.processOne();
    expect(jobs.fail).toHaveBeenCalledWith(
      'job',
      'token',
      30,
      3,
      'PROCESSING_FAILED',
    );
    expect(jobs.finish).not.toHaveBeenCalled();
  });
  it('finishes a recovered job when the batch was already completed', async () => {
    const { jobs, checks, worker } = setup('READY_TO_ASSIGN');
    await worker.processOne();
    expect(checks.execute).not.toHaveBeenCalled();
    expect(jobs.finish).toHaveBeenCalledOnce();
  });
});
