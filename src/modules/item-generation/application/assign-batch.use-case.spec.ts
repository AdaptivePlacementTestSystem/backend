import { describe, expect, it, vi } from 'vitest';
import { assignmentRevision } from '../domain/assignment-preview';
import { AssignBatchUseCase } from './assign-batch.use-case';
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222';
const item = {
  id: '33333333-3333-4333-8333-333333333333',
  skill: 'GRAMMAR',
  cefrTarget: 'A2',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};
const body = {
  confirmerId: b,
  firstDueAt: '2099-01-01T00:00:00Z',
  secondDueAt: '2099-01-02T00:00:00Z',
  assignments: [{ itemId: item.id, reviewerId: a }],
  batchRevision: assignmentRevision('READY_TO_ASSIGN', [item]),
};
function setup() {
  const tx = {
    itemBatch: {
      findUnique: vi.fn().mockResolvedValue({ status: 'READY_TO_ASSIGN' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    user: { count: vi.fn().mockResolvedValue(2) },
    item: { findMany: vi.fn().mockResolvedValue([item]), update: vi.fn() },
    itemReviewEvent: { create: vi.fn() },
  };
  return {
    tx,
    service: new AssignBatchUseCase({
      $transaction: vi.fn((fn) => fn(tx)),
    } as never),
  };
}
describe('giao lô', () => {
  it('giao toàn bộ câu và ghi sự kiện trong giao dịch', async () => {
    const { tx, service } = setup();
    expect(await service.execute('batch', 'admin', body)).toEqual({
      assigned: 1,
    });
    expect(tx.itemBatch.updateMany).toHaveBeenCalledWith({
      where: { id: 'batch', status: 'READY_TO_ASSIGN' },
      data: { status: 'IN_REVIEW', confirmerId: b },
    });
    expect(tx.itemReviewEvent.create).toHaveBeenCalledOnce();
  });
  it('chặn B thuộc nhóm A', async () => {
    const { service } = setup();
    await expect(
      service.execute('batch', 'admin', { ...body, confirmerId: a }),
    ).rejects.toThrow();
  });
  it('chặn revision cũ khi thông tin phân bổ thay đổi', async () => {
    const { tx, service } = setup();
    tx.item.findMany.mockResolvedValue([{ ...item, cefrTarget: 'B1' }]);
    await expect(service.execute('batch', 'admin', body)).rejects.toThrow();
    expect(tx.item.update).not.toHaveBeenCalled();
  });
  it('chặn khi giảng viên không hoạt động hoặc giao đồng thời', async () => {
    const first = setup();
    first.tx.user.count.mockResolvedValue(1);
    await expect(
      first.service.execute('batch', 'admin', body),
    ).rejects.toThrow();
    const second = setup();
    second.tx.itemBatch.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      second.service.execute('batch', 'admin', body),
    ).rejects.toThrow();
    expect(second.tx.item.update).not.toHaveBeenCalled();
  });
  it('chặn hạn B không sau hạn A và phân công trùng câu', async () => {
    const { service } = setup();
    await expect(
      service.execute('batch', 'admin', {
        ...body,
        secondDueAt: body.firstDueAt,
      }),
    ).rejects.toThrow();
    await expect(
      service.execute('batch', 'admin', {
        ...body,
        assignments: [body.assignments[0], body.assignments[0]],
      }),
    ).rejects.toThrow();
  });
});
