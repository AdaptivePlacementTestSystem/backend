import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateAiBatchUseCase } from './create-ai-batch.use-case';
import { ConfigService } from '@nestjs/config';

afterEach(() => vi.unstubAllEnvs());
describe('queue AI generation', () => {
  const input = {
    skill: 'GRAMMAR' as const,
    cefrTarget: 'A2' as const,
    count: 2,
    operationId: randomUUID(),
  };
  function setup(existing: unknown = null) {
    const tx = {
      itemBatch: {
        create: vi
          .fn()
          .mockResolvedValue({ id: 'batch', status: 'GENERATING' }),
      },
      itemBatchJob: { create: vi.fn() },
    };
    const db = {
      itemBatchJob: { findUnique: vi.fn().mockResolvedValue(existing) },
      $transaction: vi.fn((fn) => fn(tx)),
    };
    return {
      db,
      tx,
      service: new CreateAiBatchUseCase(
        db as never,
        new ConfigService({ AI_GENERATION_MAX_ITEMS: 20 }),
      ),
    };
  }
  it('requires provider configuration before creating a job', async () => {
    vi.stubEnv('LITELLM_BASE_URL', '');
    const { db, service } = setup();
    await expect(service.execute('admin', input)).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('creates batch and job atomically', async () => {
    vi.stubEnv('LITELLM_BASE_URL', 'https://gateway.example');
    vi.stubEnv('LITELLM_API_KEY', 'fake');
    vi.stubEnv('LITELLM_MODEL', 'fake');
    const { tx, service } = setup();
    await expect(service.execute('admin', input)).resolves.toEqual({
      batchId: 'batch',
      status: 'GENERATING',
    });
    expect(tx.itemBatchJob.create).toHaveBeenCalledWith({
      data: { id: input.operationId, batchId: 'batch', kind: 'GENERATE' },
    });
  });
  it('returns an existing job only for the same actor and parameters', async () => {
    const batch = {
      id: 'batch',
      status: 'GENERATING',
      createdById: 'admin',
      source: 'AI_GENERATED',
      name: null,
      skill: input.skill,
      cefrTarget: input.cefrTarget,
      topicTag: null,
      requestedCount: input.count,
    };
    const { service, db } = setup({ kind: 'GENERATE', batch });
    await expect(service.execute('admin', input)).resolves.toEqual({
      batchId: 'batch',
      status: 'GENERATING',
    });
    await expect(service.execute('other', input)).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
