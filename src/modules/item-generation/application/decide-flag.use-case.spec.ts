import { describe, expect, it, vi } from 'vitest';
import { DecideFlagUseCase } from './decide-flag.use-case';

describe('quyết định cờ mềm', () => {
  it('từ chối loại câu khi không có lý do', async () => {
    const transaction = vi.fn();
    const service = new DecideFlagUseCase({
      $transaction: transaction,
    } as never);
    await expect(
      service.execute('batch', 'item', 'admin', 'REJECT', '  '),
    ).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('lưu lý do loại vào audit', async () => {
    const tx = {
      itemBatch: {
        findUnique: vi.fn().mockResolvedValue({ status: 'FINAL_CHECKED' }),
        updateMany: vi.fn(),
      },
      item: {
        findFirst: vi.fn().mockResolvedValue({ status: 'SECOND_APPROVED' }),
        update: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      itemCheckResult: {
        findFirst: vi.fn().mockResolvedValue({ checkedAt: new Date() }),
      },
      itemReviewEvent: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    };
    const service = new DecideFlagUseCase({
      $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
    } as never);
    await service.execute('batch', 'item', 'admin', 'REJECT', ' lý do ');
    expect(tx.itemReviewEvent.create).toHaveBeenCalledWith({
      data: {
        batchId: 'batch',
        itemId: 'item',
        actorId: 'admin',
        action: 'REJECT',
        details: { comment: 'lý do' },
      },
    });
  });
});
