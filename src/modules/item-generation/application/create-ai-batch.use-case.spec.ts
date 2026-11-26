import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateAiBatchUseCase } from './create-ai-batch.use-case';
const input = {
  skill: 'GRAMMAR' as const,
  cefrTarget: 'A2' as const,
  count: 1,
};
const candidate = {
  content: 'She goes home.',
  options: { A: 'one', B: 'two', C: 'three', D: 'four' },
  correctAnswer: 'A',
  explanation: 'Because.',
  skill: 'GRAMMAR',
  cefrTarget: 'A2',
  irtB: 0,
};
function setup() {
  const tx = {
    item: { create: vi.fn().mockResolvedValue({}) },
    itemBatch: { update: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    itemBatch: {
      create: vi.fn().mockResolvedValue({ id: 'batch' }),
      update: vi.fn().mockResolvedValue({}),
    },
    item: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(tx)),
  };
  return {
    tx,
    prisma,
    usecase: new CreateAiBatchUseCase(
      prisma as never,
      {
        execute: vi.fn().mockResolvedValue({
          status: 'READY_TO_ASSIGN',
          remaining: 1,
          exactRejected: 0,
          nearRejected: 0,
          nearFlagged: 0,
          semanticSkipped: 0,
          semanticFlagged: 0,
        }),
      } as never,
    ),
  };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('tạo lô AI', () => {
  it('chặn khi chưa cấu hình gateway trước khi tạo lô', async () => {
    vi.stubEnv('LITELLM_BASE_URL', '');
    const { prisma, usecase } = setup();
    await expect(usecase.execute('admin', input)).rejects.toThrow();
    expect(prisma.itemBatch.create).not.toHaveBeenCalled();
  });
  it('lưu câu ở trạng thái CHECKING rồi chuyển trạng thái theo kết quả C1', async () => {
    vi.stubEnv('LITELLM_BASE_URL', 'https://gateway.example');
    vi.stubEnv('LITELLM_API_KEY', 'secret');
    vi.stubEnv('LITELLM_MODEL', 'model');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: 'model',
            choices: [
              {
                finish_reason: 'stop',
                message: { content: JSON.stringify([candidate]) },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const { tx, usecase } = setup();
    expect(await usecase.execute('admin', input)).toMatchObject({
      batchId: 'batch',
      accepted: 1,
      status: 'READY_TO_ASSIGN',
    });
    expect(tx.item.create).toHaveBeenCalledOnce();
    expect(tx.itemBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CHECKING' } }),
    );
  });
  it('đánh dấu thất bại khi AI trả dữ liệu sai', async () => {
    vi.stubEnv('LITELLM_BASE_URL', 'https://gateway.example');
    vi.stubEnv('LITELLM_API_KEY', 'secret');
    vi.stubEnv('LITELLM_MODEL', 'model');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const { prisma, usecase } = setup();
    await expect(usecase.execute('admin', input)).rejects.toThrow();
    expect(prisma.itemBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });
});
