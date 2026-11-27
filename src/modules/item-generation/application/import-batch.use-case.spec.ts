import { describe, expect, it, vi } from 'vitest';
import { ImportBatchUseCase } from './import-batch.use-case';

describe('import câu hỏi sau C3', () => {
  it('hoàn tất lô đã nhập một phần khi các câu còn lại đã bị loại', async () => {
    const tx = {
      itemBatch: { findUnique: vi.fn().mockResolvedValue({ status: 'PARTIALLY_IMPORTED' }), update: vi.fn() },
      item: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1) },
    };
    const service = new ImportBatchUseCase({ $transaction: (fn: (tx: unknown) => unknown) => fn(tx) } as never);
    await expect(service.execute('batch', 'admin')).resolves.toEqual({ status: 'DONE', imported: 0 });
    expect(tx.itemBatch.update).toHaveBeenCalledWith({ where: { id: 'batch' }, data: { status: 'DONE' } });
  });
  it('chỉ nhập câu đủ điều kiện, giữ lô nhập một phần khi còn cờ mềm', async () => {
    const tx = {
      itemBatch: { findUnique: vi.fn().mockResolvedValue({ status: 'FINAL_CHECKED' }), update: vi.fn() },
      item: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([{ id: 'ready', content: 'one', contentHash: 'h1' }, { id: 'flagged', content: 'two', contentHash: 'h2' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(1),
      },
      itemCheckResult: { findFirst: vi.fn().mockResolvedValueOnce({ checkedAt: new Date() }).mockResolvedValueOnce(null).mockResolvedValueOnce({ checkedAt: new Date() }).mockResolvedValueOnce({ checkedAt: new Date() }) },
      itemReviewEvent: { findFirst: vi.fn().mockResolvedValue(null), createMany: vi.fn() },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const service = new ImportBatchUseCase({ $transaction: (fn: (tx: unknown) => unknown) => fn(tx) } as never);
    await expect(service.execute('batch', 'admin')).resolves.toEqual({ status: 'PARTIALLY_IMPORTED', imported: 1 });
    expect(tx.item.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['ready'] }, status: 'SECOND_APPROVED' } }));
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.itemBatch.update).toHaveBeenCalledWith({ where: { id: 'batch' }, data: { status: 'PARTIALLY_IMPORTED' } });
  });
  it('chặn import khi ngân hàng phát sinh câu trùng', async () => {
    const tx = {
      itemBatch: {
        findUnique: vi.fn().mockResolvedValue({ status: 'FINAL_CHECKED' }),
        update: vi.fn(),
      },
      item: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'i', content: 'Question', contentHash: 'hash' },
          ]),
        updateMany: vi.fn(),
      },
      itemCheckResult: { findFirst: vi.fn().mockResolvedValueOnce({ checkedAt: new Date() }).mockResolvedValueOnce(null) },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'other', score: 1 }]),
    };
    const prisma = { $transaction: (fn: (tx: unknown) => unknown) => fn(tx) };
    const service = new ImportBatchUseCase(prisma as never);
    await expect(service.execute('batch', 'admin')).rejects.toThrow(/trùng/);
    expect(tx.item.updateMany).not.toHaveBeenCalled();
  });
  it('chặn import khi chưa có dấu kiểm tra đáp án mới nhất', async () => {
    const tx = {
      itemBatch: {
        findUnique: vi.fn().mockResolvedValue({ status: 'FINAL_CHECKED' }),
        update: vi.fn(),
      },
      item: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'i', content: 'Question', contentHash: 'hash' },
          ]),
        updateMany: vi.fn(),
        count: vi.fn().mockResolvedValue(1),
      },
      itemCheckResult: { findFirst: vi.fn().mockResolvedValue(null) },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const prisma = { $transaction: (fn: (tx: unknown) => unknown) => fn(tx) };
    await expect(
      new ImportBatchUseCase(prisma as never).execute('batch', 'admin'),
    ).rejects.toThrow(/C3/);
    expect(tx.item.updateMany).not.toHaveBeenCalled();
  });
});
