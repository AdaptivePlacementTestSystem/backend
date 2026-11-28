import { describe, expect, it, vi } from 'vitest';
import { TeacherReviewUseCase } from './teacher-review.use-case';

function setup(status = 'FIRST_APPROVED') {
  const tx = {
    item: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'i',
        batchId: 'b',
        reviewerId: 'a',
        confirmerId: 'c',
        status,
        firstReview: { dueAt: 'date' },
        secondReview: { dueAt: 'date' },
        batch: { status: 'IN_REVIEW', confirmerId: 'c' },
      }),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    itemReviewEvent: { create: vi.fn() },
    itemBatch: { updateMany: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { tx, service: new TeacherReviewUseCase(prisma as never) };
}
describe('quyết định duyệt A/B', () => {
  it('hiển thị ngay câu đã duyệt trong hộp việc B', async () => {
    const item = {
      id: 'i',
      batchId: 'b',
      reviewerId: 'a',
      confirmerId: 'c',
      firstReview: {},
      secondReview: {},
      explanation: null,
      checkResults: [],
      batch: { name: 'Lô', confirmerId: 'c' },
    };
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([{ batchId: 'b', reviewerId: 'a' }]);
    const service = new TeacherReviewUseCase({ item: { findMany } } as never);
    expect(await service.list('c')).toEqual([
      expect.objectContaining({ id: 'i', role: 'B' }),
    ]);
    expect(findMany).toHaveBeenCalledOnce();
  });
  it('cho phép B xác nhận khi A còn câu chưa xử lý', async () => {
    const { service, tx } = setup();
    tx.item.count.mockResolvedValue(1);
    await expect(service.decide('c', 'i', 'CONFIRM')).resolves.toEqual({
      id: 'i',
      status: 'SECOND_APPROVED',
    });
    expect(tx.itemBatch.updateMany).not.toHaveBeenCalled();
  });
  it.each(['REJECT', 'REMOVE'] as const)(
    'bắt buộc comment khi %s',
    async (action) => {
      const { service, tx } = setup(
        action === 'REJECT' ? 'DRAFT' : 'FIRST_APPROVED',
      );
      await expect(
        service.decide(action === 'REJECT' ? 'a' : 'c', 'i', action, '  '),
      ).rejects.toThrow();
      expect(tx.item.updateMany).not.toHaveBeenCalled();
    },
  );
  it('từ chối comment không phải chuỗi', async () => {
    const { service, tx } = setup('DRAFT');
    await expect(
      service.decide('a', 'i', 'REJECT', {} as string),
    ).rejects.toThrow('Comment phải là chuỗi');
    expect(tx.item.updateMany).not.toHaveBeenCalled();
  });
  it('lưu comment loại câu vào kết quả duyệt', async () => {
    const { service, tx } = setup('DRAFT');
    await service.decide('a', 'i', 'REJECT', ' lý do ');
    expect(tx.item.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstReview: expect.objectContaining({ comment: 'lý do' }),
        }),
      }),
    );
  });
  it('chặn người không được phân công', async () => {
    const { service, tx } = setup();
    await expect(service.decide('other', 'i', 'CONFIRM')).rejects.toThrow();
    expect(tx.item.updateMany).not.toHaveBeenCalled();
  });
  it('xác nhận câu khi A đã hoàn tất và ghi sự kiện', async () => {
    const { service, tx } = setup();
    tx.item.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await expect(service.decide('c', 'i', 'CONFIRM')).resolves.toEqual({
      id: 'i',
      status: 'SECOND_APPROVED',
    });
    expect(tx.itemReviewEvent.create).toHaveBeenCalledWith({
      data: { batchId: 'b', itemId: 'i', actorId: 'c', action: 'CONFIRM' },
    });
    expect(tx.itemBatch.updateMany).toHaveBeenCalledOnce();
  });
  it('đóng lô khi câu cuối bị loại và không còn câu được duyệt', async () => {
    const { service, tx } = setup('DRAFT');
    await service.decide('a', 'i', 'REJECT', 'Không phù hợp');
    expect(tx.itemBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'DONE' } }),
    );
  });
  it('chặn ghi sự kiện khi câu đã bị xử lý đồng thời', async () => {
    const { service, tx } = setup('DRAFT');
    tx.item.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.decide('a', 'i', 'APPROVE')).rejects.toThrow();
    expect(tx.itemReviewEvent.create).not.toHaveBeenCalled();
  });
});

describe('sửa câu trước khi duyệt', () => {
  const input = {
    content: 'New question',
    options: { A: 'one', B: 'two', C: 'three', D: 'four' },
    correctAnswer: 'A',
    explanation: 'Explanation',
  };
  function editSetup() {
    const tx = {
      item: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'i',
          reviewerId: 'a',
          status: 'DRAFT',
          batch: { status: 'IN_REVIEW' },
          content: 'Old question',
          options: input.options,
          correctAnswer: 'A',
          explanation: { content: 'Old explanation' },
          skill: 'GRAMMAR',
          cefrTarget: 'B1',
          topicTag: null,
          firstReview: { dueAt: 'date' },
        }),
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      explanation: { upsert: vi.fn() },
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    return {
      tx,
      service: new TeacherReviewUseCase({
        $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
      } as never),
    };
  }
  it('lưu bản gốc và nội dung mới khi kiểm tra hợp lệ', async () => {
    const { tx, service } = editSetup();
    await service.edit('a', 'i', input);
    expect(tx.item.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstReview: expect.objectContaining({
            dueAt: 'date',
            originalSnapshot: expect.objectContaining({
              content: 'Old question',
            }),
          }),
        }),
      }),
    );
    expect(tx.explanation.upsert).toHaveBeenCalledOnce();
  });
  it('chặn sửa trùng gần trước khi lưu', async () => {
    const { tx, service } = editSetup();
    tx.$queryRaw.mockResolvedValue([{ score: 0.99 }]);
    await expect(service.edit('a', 'i', input)).rejects.toThrow();
    expect(tx.item.updateMany).not.toHaveBeenCalled();
  });
  it('chặn giảng viên không được giao sửa câu', async () => {
    const { tx, service } = editSetup();
    await expect(service.edit('c', 'i', input)).rejects.toThrow();
    expect(tx.item.updateMany).not.toHaveBeenCalled();
  });
});

describe('xác nhận tất cả trong một lô', () => {
  it('chỉ xác nhận câu đã sẵn sàng của B trong lô đã chọn', async () => {
    const tx = {
      itemBatch: {
        findUnique: vi.fn().mockResolvedValue({ status: 'IN_REVIEW' }),
        updateMany: vi.fn(),
      },
      item: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            { id: 'ready', reviewerId: 'a', secondReview: { dueAt: 'date' } },
            { id: 'blocked', reviewerId: 'other', secondReview: {} },
          ])
          .mockResolvedValueOnce([{ reviewerId: 'other' }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(1),
      },
      itemReviewEvent: { create: vi.fn() },
    };
    const service = new TeacherReviewUseCase({
      $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
    } as never);
    await expect(service.confirmAll('c', 'batch')).resolves.toEqual({
      confirmed: 2,
    });
    expect(tx.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          batchId: 'batch',
          batch: { is: { confirmerId: 'c', status: 'IN_REVIEW' } },
          status: 'FIRST_APPROVED',
        },
      }),
    );
    expect(tx.item.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.item.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'ready',
          batchId: 'batch',
          batch: { is: { confirmerId: 'c', status: 'IN_REVIEW' } },
          status: 'FIRST_APPROVED',
        },
      }),
    );
    expect(tx.itemReviewEvent.create).toHaveBeenCalledWith({
      data: {
        batchId: 'batch',
        itemId: null,
        actorId: 'c',
        action: 'CONFIRM_ALL',
        details: { updatedCount: 2, itemIds: ['ready', 'blocked'] },
      },
    });
    expect(tx.itemReviewEvent.create).toHaveBeenCalledOnce();
    expect(tx.itemBatch.updateMany).not.toHaveBeenCalled();
  });
});
