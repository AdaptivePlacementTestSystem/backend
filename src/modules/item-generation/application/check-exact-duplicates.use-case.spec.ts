import { describe, expect, it, vi } from 'vitest';
import { CheckExactDuplicatesUseCase } from './check-exact-duplicates.use-case';
describe('kiểm tra trùng chính xác', () => {
  it('loại và ghi lý do khi đã có câu cùng hash trong lô khác', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'new', contentHash: 'hash' }])
      .mockResolvedValueOnce([{ id: 'existing', contentHash: 'hash' }]);
    const tx = {
      item: { findMany, updateMany: vi.fn() },
      itemCheckResult: { createMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    expect(
      await new CheckExactDuplicatesUseCase(prisma as never).execute('batch'),
    ).toEqual({ checked: 1, rejected: 1 });
    expect(tx.item.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'AI_REJECTED' } }),
    );
    expect(tx.itemCheckResult.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          suspectedDuplicateId: 'existing',
          reasonCodes: ['DUPLICATE_EXACT'],
        }),
      ],
    });
  });
});
