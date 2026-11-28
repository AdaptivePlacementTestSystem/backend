import { describe, expect, it, vi } from 'vitest';
import { FinalCheckBatchUseCase } from './final-check-batch.use-case';

describe('kiểm tra C3', () => {
  it('không mở import khi G5 thất bại', async () => {
    const prisma = {
      itemBatch: {
        findUnique: vi.fn().mockResolvedValue({ status: 'READY_TO_FINALIZE' }),
      },
      item: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };
    const semantic = { execute: vi.fn() };
    const answer = { execute: vi.fn().mockRejectedValue(new Error('AI down')) };
    const service = new FinalCheckBatchUseCase(
      prisma as never,
      semantic as never,
      answer as never,
    );
    await expect(service.execute('batch')).rejects.toThrow(/T3\/G5/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('không mở import khi T3 không cấu hình', async () => {
    const prisma = {
      itemBatch: {
        findUnique: vi.fn().mockResolvedValue({ status: 'READY_TO_FINALIZE' }),
      },
      item: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };
    const semantic = { execute: vi.fn().mockResolvedValue({ skipped: true }) };
    const answer = { execute: vi.fn().mockResolvedValue({}) };
    const service = new FinalCheckBatchUseCase(
      prisma as never,
      semantic as never,
      answer as never,
    );
    await expect(service.execute('batch')).rejects.toThrow(/T3\/G5/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
