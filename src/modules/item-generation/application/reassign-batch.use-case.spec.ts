import { describe, expect, it, vi } from 'vitest';
import { ReassignBatchUseCase } from './reassign-batch.use-case';

const oldTeacher = '11111111-1111-4111-8111-111111111111';
const newTeacher = '22222222-2222-4222-8222-222222222222';
const confirmer = '33333333-3333-4333-8333-333333333333';
const input = { fromAssigneeId: oldTeacher, toAssigneeId: newTeacher, reason: 'Đổi người xử lý' };
function setup() {
  const tx = {
    itemBatch: { findUnique: vi.fn().mockResolvedValue({ status: 'IN_REVIEW', confirmerId: confirmer }) },
    user: { findFirst: vi.fn().mockResolvedValue({ id: newTeacher }) },
    item: { findMany: vi.fn().mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]), updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    itemReviewEvent: { createMany: vi.fn() },
  };
  const notifications = { assigned: vi.fn().mockResolvedValue(undefined) };
  return { tx, notifications, service: new ReassignBatchUseCase({ $transaction: (fn: (tx: unknown) => unknown) => fn(tx) } as never, notifications as never) };
}
describe('giao lại câu DRAFT', () => {
  it('yêu cầu lý do giao lại', async () => {
    const { service, tx } = setup();
    await expect(service.execute('batch', 'admin', { ...input, reason: '  ' })).rejects.toThrow();
    expect(tx.item.updateMany).not.toHaveBeenCalled();
  });
  it('đổi GV A, giữ GV B và hạn; ghi audit mỗi câu', async () => {
    const { service, tx, notifications } = setup();
    await expect(service.execute('batch', 'admin', input)).resolves.toEqual({ reassigned: 2 });
    expect(tx.item.findMany).toHaveBeenCalledWith({ where: { batchId: 'batch', status: 'DRAFT', reviewerId: oldTeacher }, select: { id: true } });
    expect(tx.item.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { reviewerId: newTeacher, firstAssignmentNoticeSent: false, firstReminderSent: false } }));
    expect(tx.itemReviewEvent.createMany).toHaveBeenCalledWith({ data: ['i1', 'i2'].map((itemId) => ({ batchId: 'batch', itemId, actorId: 'admin', action: 'REASSIGN', details: input })) });
    expect(notifications.assigned).toHaveBeenCalledWith('batch');
  });
  it('chặn chọn GV B làm A', async () => {
    const { service, tx } = setup();
    await expect(service.execute('batch', 'admin', { ...input, toAssigneeId: confirmer })).rejects.toThrow();
    expect(tx.item.updateMany).not.toHaveBeenCalled();
  });
  it('không giao lại câu đã loại hoặc đã qua vòng A', async () => {
    const { service, tx } = setup();
    tx.item.findMany.mockResolvedValue([]);
    await expect(service.execute('batch', 'admin', input)).rejects.toThrow();
    expect(tx.item.updateMany).not.toHaveBeenCalled();
    expect(tx.itemReviewEvent.createMany).not.toHaveBeenCalled();
  });
  it('không ghi audit nếu câu thay đổi đồng thời', async () => {
    const { service, tx } = setup();
    tx.item.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.execute('batch', 'admin', input)).rejects.toThrow();
    expect(tx.itemReviewEvent.createMany).not.toHaveBeenCalled();
  });
});
