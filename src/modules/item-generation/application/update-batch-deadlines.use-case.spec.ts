import { describe, expect, it, vi } from 'vitest';
import { UpdateBatchDeadlinesUseCase } from './update-batch-deadlines.use-case';
const input = {
  firstDueAt: '2099-01-01T00:00:00Z',
  secondDueAt: '2099-01-02T00:00:00Z',
  reason: 'Điều chỉnh lịch',
};
function setup() {
  const tx = {
    itemBatch: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ status: 'IN_REVIEW', confirmerId: 'b' }),
    },
    item: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'a',
          status: 'DRAFT',
          firstReview: { note: 'keep' },
          secondReview: {},
        },
        {
          id: 'b',
          status: 'FIRST_APPROVED',
          firstReview: { action: 'APPROVE' },
          secondReview: {},
        },
      ]),
      update: vi.fn(),
    },
    itemReviewEvent: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { tx, service: new UpdateBatchDeadlinesUseCase(prisma as never) };
}
describe('chỉnh hạn chung', () => {
  it('chỉ cập nhật vòng chưa xử lý và giữ dữ liệu đã có', async () => {
    const { tx, service } = setup();
    await service.execute('batch', 'admin', input);
    expect(tx.item.update).toHaveBeenCalledTimes(2);
    expect(tx.item.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          firstReview: expect.objectContaining({
            note: 'keep',
            dueAt: '2099-01-01T00:00:00.000Z',
          }),
        }),
      }),
    );
    expect(tx.item.update.mock.calls[1][0].data).not.toHaveProperty(
      'firstReview',
    );
    expect(tx.itemReviewEvent.create).toHaveBeenCalledOnce();
    expect(tx.itemReviewEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        batchId: 'batch',
        itemId: null,
        actorId: 'admin',
        action: 'UPDATE_DUE_DATE',
        details: expect.objectContaining({
          reason: input.reason,
          updatedCount: 2,
          itemIds: ['a', 'b'],
        }),
      }),
    });
  });
  it('không sửa hạn lô ngoài vòng duyệt', async () => {
    const { tx, service } = setup();
    tx.itemBatch.findUnique.mockResolvedValue({
      status: 'DONE',
      confirmerId: 'b',
    });
    await expect(service.execute('batch', 'admin', input)).rejects.toThrow();
    expect(tx.item.update).not.toHaveBeenCalled();
  });
  it('từ chối hạn B trước hạn A', async () => {
    const { service } = setup();
    await expect(
      service.execute('batch', 'admin', {
        firstDueAt: input.secondDueAt,
        secondDueAt: input.firstDueAt,
        reason: input.reason,
      }),
    ).rejects.toThrow();
  });
  it('từ chối lý do trống', async () => {
    const { service, tx } = setup();
    await expect(
      service.execute('batch', 'admin', { ...input, reason: ' ' }),
    ).rejects.toThrow();
    expect(tx.itemReviewEvent.create).not.toHaveBeenCalled();
  });
});
