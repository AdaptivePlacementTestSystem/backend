import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { GetAdminBatchUseCase } from './get-admin-batch.use-case';
import { PrismaService } from '../../../shared/prisma/prisma.service';

describe('GetAdminBatchUseCase', () => {
  it('applies the same filters to rows and count', async () => {
    const prisma = {
      itemBatch: {
        findMany: vi.fn().mockReturnValue('rows'),
        count: vi.fn().mockReturnValue('count'),
      },
      $transaction: vi.fn().mockResolvedValue([[], 0]),
    };
    await new GetAdminBatchUseCase(prisma as never).list(2, 20, {
      status: 'CHECKING',
      source: 'IMPORTED',
    });
    expect(prisma.itemBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'CHECKING', source: 'IMPORTED' },
        skip: 20,
        take: 20,
      }),
    );
    expect(prisma.itemBatch.count).toHaveBeenCalledWith({
      where: { status: 'CHECKING', source: 'IMPORTED' },
    });
  });
  it('lấy danh sách lô với giới hạn và tổng số', async () => {
    const prisma = {
      itemBatch: {
        findMany: vi.fn().mockReturnValue('rows'),
        count: vi.fn().mockReturnValue('count'),
      },
      $transaction: vi.fn().mockResolvedValue([[{ id: 'batch' }], 1]),
    };
    const result = await new GetAdminBatchUseCase(
      prisma as unknown as PrismaService,
    ).list(1, 20);
    expect(prisma.itemBatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
    expect(result).toEqual({
      data: [{ id: 'batch' }],
      total: 1,
      page: 1,
      limit: 20,
    });
  });
  it('trả dữ liệu lô, phân trang và thống kê trạng thái', async () => {
    const prisma = {
      itemBatch: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 'batch', status: 'IN_REVIEW' }),
      },
      item: {
        findMany: vi.fn().mockReturnValue('items'),
        count: vi.fn().mockReturnValue('count'),
        groupBy: vi.fn().mockReturnValue('group'),
      },
      itemReviewEvent: { findMany: vi.fn().mockReturnValue('events') },
      $transaction: vi
        .fn()
        .mockResolvedValue([
          [{ id: 'item' }],
          12,
          [{ status: 'DRAFT', _count: { _all: 12 } }],
          [],
        ]),
    };
    const result = await new GetAdminBatchUseCase(
      prisma as unknown as PrismaService,
    ).execute('batch', 2, 5);
    expect(prisma.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { batchId: 'batch' },
        skip: 5,
        take: 5,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        total: 12,
        page: 2,
        limit: 5,
        statusCounts: [{ status: 'DRAFT', count: 12 }],
      }),
    );
  });

  it('báo không tìm thấy và không truy vấn câu nếu lô không tồn tại', async () => {
    const prisma = {
      itemBatch: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };
    await expect(
      new GetAdminBatchUseCase(prisma as unknown as PrismaService).execute(
        'missing',
        1,
        20,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
