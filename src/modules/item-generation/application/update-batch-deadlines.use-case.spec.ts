import { describe, expect, it, vi } from 'vitest';
import { UpdateBatchDeadlinesUseCase } from './update-batch-deadlines.use-case';
const input = {
  firstDueAt: '2099-01-01T00:00:00Z',
  secondDueAt: '2099-01-02T00:00:00Z',
};
function setup() {
  const tx = {
    itemBatch: {
      findUnique: vi.fn().mockResolvedValue({ status: 'IN_REVIEW' }),
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
        {
          id: 'c',
          status: 'SECOND_APPROVED',
          firstReview: {},
          secondReview: {},
        },
      ]),
      update: vi.fn(),
    },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { tx, service: new UpdateBatchDeadlinesUseCase(prisma as never) };
}
describe('chỉnh hạn chung', () => {
  it('chỉ cập nhật vòng chưa xử lý và giữ dữ liệu đã có', async () => {
    const { tx, service } = setup();
    await service.execute('batch', input);
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
  });
  it('không sửa hạn lô ngoài vòng duyệt', async () => {
    const { tx, service } = setup();
    tx.itemBatch.findUnique.mockResolvedValue({ status: 'DONE' });
    await expect(service.execute('batch', input)).rejects.toThrow();
    expect(tx.item.update).not.toHaveBeenCalled();
  });
  it('từ chối hạn B trước hạn A', async () => {
    const { service } = setup();
    await expect(
      service.execute('batch', {
        firstDueAt: input.secondDueAt,
        secondDueAt: input.firstDueAt,
      }),
    ).rejects.toThrow();
  });
});
