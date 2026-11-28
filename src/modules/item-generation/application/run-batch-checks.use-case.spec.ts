import { describe, expect, it, vi } from 'vitest';
import { RunBatchChecksUseCase } from './run-batch-checks.use-case';

describe('kiểm tra chất lượng lô', () => {
  it('không mở giao việc nếu T3 chưa cấu hình', async () => {
    const prisma = { itemBatch: { updateMany: vi.fn() } };
    const t1 = { execute: vi.fn().mockResolvedValue({ rejected: 0 }) };
    const t2 = {
      execute: vi.fn().mockResolvedValue({ rejected: 0, flagged: 0 }),
    };
    const t3 = { execute: vi.fn().mockResolvedValue({ skipped: true }) };
    const g5 = { execute: vi.fn().mockResolvedValue({ flagged: 0 }) };
    const usecase = new RunBatchChecksUseCase(
      prisma as never,
      t1 as never,
      t2 as never,
      t3 as never,
      g5 as never,
    );
    await expect(usecase.execute('batch')).rejects.toThrow(/T3/);
    expect(prisma.itemBatch.updateMany).not.toHaveBeenCalled();
    expect(g5.execute).not.toHaveBeenCalled();
  });
  it('không mở giao việc nếu G5 lỗi', async () => {
    const prisma = { itemBatch: { updateMany: vi.fn() } };
    const t1 = { execute: vi.fn().mockResolvedValue({ rejected: 0 }) };
    const t2 = {
      execute: vi.fn().mockResolvedValue({ rejected: 0, flagged: 0 }),
    };
    const t3 = {
      execute: vi.fn().mockResolvedValue({ skipped: false, flagged: 0 }),
    };
    const g5 = {
      execute: vi.fn().mockRejectedValue(new Error('AI unavailable')),
    };
    const usecase = new RunBatchChecksUseCase(
      prisma as never,
      t1 as never,
      t2 as never,
      t3 as never,
      g5 as never,
    );
    await expect(usecase.execute('batch')).rejects.toThrow();
    expect(prisma.itemBatch.updateMany).not.toHaveBeenCalled();
  });
  it('chạy các tầng rẻ trước, chỉ gọi G5 sau T1, T2 và T3', async () => {
    const order: string[] = [];
    const stage = (name: string, value: unknown) => ({
      execute: vi.fn(async () => {
        order.push(name);
        return value;
      }),
    });
    const prisma = {
      item: { count: vi.fn().mockResolvedValue(1) },
      itemBatch: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const service = new RunBatchChecksUseCase(
      prisma as never,
      stage('T1', { rejected: 0 }) as never,
      stage('T2', { rejected: 0, flagged: 0 }) as never,
      stage('T3', { skipped: false, flagged: 0 }) as never,
      stage('G5', { flagged: 0 }) as never,
    );
    await service.execute('batch');
    expect(order).toEqual(['T1', 'T2', 'T3', 'G5']);
  });
  it('không báo hoàn tất khi trạng thái lô đã thay đổi đồng thời', async () => {
    const prisma = {
      item: { count: vi.fn().mockResolvedValue(1) },
      itemBatch: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const t1 = { execute: vi.fn().mockResolvedValue({ rejected: 0 }) };
    const t2 = {
      execute: vi.fn().mockResolvedValue({ rejected: 0, flagged: 0 }),
    };
    const t3 = {
      execute: vi.fn().mockResolvedValue({ skipped: false, flagged: 0 }),
    };
    const g5 = { execute: vi.fn().mockResolvedValue({ flagged: 0 }) };
    const service = new RunBatchChecksUseCase(
      prisma as never,
      t1 as never,
      t2 as never,
      t3 as never,
      g5 as never,
    );
    await expect(service.execute('batch')).rejects.toThrow(/trạng thái/i);
  });
});
