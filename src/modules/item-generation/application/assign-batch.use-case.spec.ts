import { describe, expect, it, vi } from 'vitest';
import { AssignBatchUseCase } from './assign-batch.use-case';
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const body = {
  reviewerIds: [a],
  confirmerIds: [b],
  firstDueAt: '2099-01-01T00:00:00Z',
  secondDueAt: '2099-01-02T00:00:00Z',
  assignments: [{ itemId: 'item', reviewerId: a, confirmerId: b }],
};
function setup() {
  const tx = {
    itemBatch: {
      findUnique: vi.fn().mockResolvedValue({ status: 'READY_TO_ASSIGN' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: { count: vi.fn().mockResolvedValue(2) },
    item: {
      findMany: vi.fn().mockResolvedValue([{ id: 'item' }]),
      update: vi.fn(),
    },
    itemReviewEvent: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((fn: (arg: typeof tx) => unknown) => fn(tx)),
  };
  return { tx, service: new AssignBatchUseCase(prisma as never) };
}
describe('giao lô', () => {
  it('giao toàn bộ câu và ghi sự kiện trong giao dịch', async () => {
    const { tx, service } = setup();
    expect(await service.execute('batch', 'admin', body)).toEqual({
      assigned: 1,
    });
    expect(tx.item.update).toHaveBeenCalledOnce();
    expect(tx.itemReviewEvent.create).toHaveBeenCalledOnce();
  });
  it('chặn giảng viên thuộc cả hai nhóm', async () => {
    const { service } = setup();
    await expect(
      service.execute('batch', 'admin', { ...body, confirmerIds: [a] }),
    ).rejects.toThrow();
  });
  it('chặn chọn nhiều giảng viên B cho cùng lô', async () => {
    const { service, tx } = setup();
    await expect(
      service.execute('batch', 'admin', {
        ...body,
        confirmerIds: [b, '33333333-3333-4333-8333-333333333333'],
      }),
    ).rejects.toThrow();
    expect(tx.item.update).not.toHaveBeenCalled();
  });
  it('chặn danh sách câu cũ hoặc thiếu', async () => {
    const { tx, service } = setup();
    tx.item.findMany.mockResolvedValue([{ id: 'item' }, { id: 'other' }]);
    await expect(service.execute('batch', 'admin', body)).rejects.toThrow();
    expect(tx.item.update).not.toHaveBeenCalled();
  });
  it('chặn giao lặp lại', async () => {
    const { tx, service } = setup();
    tx.itemBatch.findUnique.mockResolvedValue({ status: 'IN_REVIEW' });
    await expect(service.execute('batch', 'admin', body)).rejects.toThrow();
  });
  it('không giao khi hạn B không sau hạn A', async () => {
    const { tx, service } = setup();
    await expect(
      service.execute('batch', 'admin', {
        ...body,
        secondDueAt: body.firstDueAt,
      }),
    ).rejects.toThrow();
    expect(tx.item.update).not.toHaveBeenCalled();
  });
  it('không giao cho giảng viên không hợp lệ hoặc không hoạt động', async () => {
    const { tx, service } = setup();
    tx.user.count.mockResolvedValue(1);
    await expect(service.execute('batch', 'admin', body)).rejects.toThrow();
    expect(tx.item.update).not.toHaveBeenCalled();
  });
  it('không ghi phân công khi có yêu cầu giao đồng thời thắng trước', async () => {
    const { tx, service } = setup();
    tx.itemBatch.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.execute('batch', 'admin', body)).rejects.toThrow();
    expect(tx.item.update).not.toHaveBeenCalled();
    expect(tx.itemReviewEvent.create).not.toHaveBeenCalled();
  });
});
