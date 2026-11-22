import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ItemStatus, ReviewAction, ItemBatchStatus } from '@apt/shared-types';
import { GetTeacherReviewTasksUseCase } from './get-teacher-review-tasks.use-case';
import { GetBatchItemsForReviewUseCase } from './get-batch-items-for-review.use-case';
import { EditItemUseCase } from './edit-item.use-case';
import { ReviewItemUseCase } from './review-item.use-case';
import { GetTeacherConfirmTasksUseCase } from './get-teacher-confirm-tasks.use-case';
import { GetBatchItemsForConfirmUseCase } from './get-batch-items-for-confirm.use-case';
import { ConfirmItemUseCase } from './confirm-item.use-case';
import { ConfirmAllItemsUseCase } from './confirm-all-items.use-case';

describe('Teacher Review Use Cases (UCGV04, UCGV14, UCGV15)', () => {
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      item: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      itemBatch: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      explanation: {
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
      itemReviewEvent: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => cb(prismaMock)),
    };
  });

  describe('GetTeacherReviewTasksUseCase (S33)', () => {
    it('nhóm các câu hỏi theo lô và tính toán tiến độ chính xác', async () => {
      const teacherId = 'teacher-1';
      prismaMock.item.findMany.mockResolvedValue([
        {
          id: 'item-1',
          batchId: 'batch-1',
          status: ItemStatus.DRAFT,
          firstReview: { dueAt: '2026-11-25T23:59:59Z' },
          batch: { id: 'batch-1', name: 'Lô Từ vựng B1', status: 'IN_REVIEW' },
        },
        {
          id: 'item-2',
          batchId: 'batch-1',
          status: ItemStatus.FIRST_APPROVED,
          firstReview: { dueAt: '2026-11-25T23:59:59Z', action: ReviewAction.APPROVE },
          batch: { id: 'batch-1', name: 'Lô Từ vựng B1', status: 'IN_REVIEW' },
        },
      ]);
      prismaMock.item.count.mockResolvedValue(3);

      const useCase = new GetTeacherReviewTasksUseCase(prismaMock);
      const result = await useCase.execute(teacherId);

      expect(result.batches).toHaveLength(1);
      expect(result.batches[0].batchName).toBe('Lô Từ vựng B1');
      expect(result.batches[0].totalAssigned).toBe(2);
      expect(result.batches[0].decidedCount).toBe(1);
      expect(result.batches[0].pendingCount).toBe(1);
      expect(result.stats.pendingReviews).toBe(1);
      expect(result.stats.pendingConfirms).toBe(3);
    });
  });

  describe('EditItemUseCase (UCGV04)', () => {
    it('chụp originalSnapshot ở lần sửa đầu tiên và cập nhật nội dung thành công', async () => {
      const teacherId = 'teacher-1';
      const existingItem = {
        id: 'item-1',
        reviewerId: teacherId,
        status: ItemStatus.DRAFT,
        content: 'Original stem',
        options: { A: '1', B: '2', C: '3', D: '4' },
        correctAnswer: 'A',
        firstReview: { dueAt: '2026-11-25T00:00:00Z' },
        explanation: { content: 'Original explanation' },
        checkResults: [],
      };

      prismaMock.item.findUnique.mockResolvedValue(existingItem);
      prismaMock.item.update.mockResolvedValue({
        ...existingItem,
        content: 'Updated stem',
        options: { A: '10', B: '20', C: '30', D: '40' },
      });
      prismaMock.explanation.findUnique.mockResolvedValue({ content: 'Original explanation' });

      const useCase = new EditItemUseCase(prismaMock);
      const result = await useCase.execute(teacherId, 'item-1', {
        content: 'Updated stem',
        options: { A: '10', B: '20', C: '30', D: '40' },
      });

      expect(result.hasEdited).toBe(true);
      expect(result.firstReview?.originalSnapshot).toEqual({
        content: 'Original stem',
        options: { A: '1', B: '2', C: '3', D: '4' },
        correctAnswer: 'A',
        explanation: 'Original explanation',
      });
    });

    it('từ chối sửa nếu người gọi không phải reviewerId được giao (NOT_ASSIGNED)', async () => {
      prismaMock.item.findUnique.mockResolvedValue({
        id: 'item-1',
        reviewerId: 'another-teacher',
        status: ItemStatus.DRAFT,
      });

      const useCase = new EditItemUseCase(prismaMock);
      await expect(
        useCase.execute('teacher-1', 'item-1', { content: 'Hack' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('từ chối sửa nếu câu không còn ở DRAFT', async () => {
      prismaMock.item.findUnique.mockResolvedValue({
        id: 'item-1',
        reviewerId: 'teacher-1',
        status: ItemStatus.FIRST_APPROVED,
      });

      const useCase = new EditItemUseCase(prismaMock);
      await expect(
        useCase.execute('teacher-1', 'item-1', { content: 'New' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ReviewItemUseCase (UCGV14)', () => {
    it('duyệt câu hỏi chuyển trạng thái sang FIRST_APPROVED và ghi log kiểm toán', async () => {
      const teacherId = 'teacher-1';
      prismaMock.item.findUnique.mockResolvedValue({
        id: 'item-1',
        batchId: 'batch-1',
        reviewerId: teacherId,
        status: ItemStatus.DRAFT,
        firstReview: {},
      });

      const useCase = new ReviewItemUseCase(prismaMock);
      const result = await useCase.execute(teacherId, 'item-1', 'APPROVE', 'Câu tốt');

      expect(result.success).toBe(true);
      expect(result.status).toBe(ItemStatus.FIRST_APPROVED);
      expect(prismaMock.item.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: expect.objectContaining({
            status: ItemStatus.FIRST_APPROVED,
          }),
        }),
      );
      expect(prismaMock.itemReviewEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: ReviewAction.APPROVE,
          actorId: teacherId,
        }),
      });
    });

    it('từ chối câu hỏi chuyển trạng thái sang REJECTED', async () => {
      const teacherId = 'teacher-1';
      prismaMock.item.findUnique.mockResolvedValue({
        id: 'item-1',
        batchId: 'batch-1',
        reviewerId: teacherId,
        status: ItemStatus.DRAFT,
        firstReview: {},
      });

      const useCase = new ReviewItemUseCase(prismaMock);
      const result = await useCase.execute(teacherId, 'item-1', 'REJECT');

      expect(result.success).toBe(true);
      expect(result.status).toBe(ItemStatus.REJECTED);
      expect(prismaMock.itemReviewEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: ReviewAction.REJECT,
        }),
      });
    });
  });

  describe('ConfirmItemUseCase (UCGV15)', () => {
    it('GV B xác nhận câu chuyển sang SECOND_APPROVED và tự động chốt lô nếu hết câu', async () => {
      const teacherId = 'teacher-b';
      prismaMock.item.findUnique.mockResolvedValue({
        id: 'item-1',
        batchId: 'batch-1',
        confirmerId: teacherId,
        status: ItemStatus.FIRST_APPROVED,
        secondReview: {},
      });
      // Không còn câu nào chưa duyệt trong lô
      prismaMock.item.count.mockResolvedValue(0);

      const useCase = new ConfirmItemUseCase(prismaMock);
      const result = await useCase.execute(teacherId, 'item-1', 'CONFIRM');

      expect(result.success).toBe(true);
      expect(result.status).toBe(ItemStatus.SECOND_APPROVED);
      expect(result.batchFinalized).toBe(true);
      expect(prismaMock.itemBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: { status: ItemBatchStatus.READY_TO_FINALIZE },
      });
    });

    it('GV B loại bỏ câu chuyển sang REJECTED', async () => {
      const teacherId = 'teacher-b';
      prismaMock.item.findUnique.mockResolvedValue({
        id: 'item-1',
        batchId: 'batch-1',
        confirmerId: teacherId,
        status: ItemStatus.FIRST_APPROVED,
        secondReview: {},
      });
      prismaMock.item.count.mockResolvedValue(2); // còn câu khác chưa xong

      const useCase = new ConfirmItemUseCase(prismaMock);
      const result = await useCase.execute(teacherId, 'item-1', 'REMOVE', 'Không đạt chuẩn B2');

      expect(result.success).toBe(true);
      expect(result.status).toBe(ItemStatus.REJECTED);
      expect(result.batchFinalized).toBe(false);
    });
  });

  describe('ConfirmAllItemsUseCase (UCGV15)', () => {
    it('xác nhận hàng loạt tất cả câu FIRST_APPROVED trong lô và ghi log CONFIRM_ALL', async () => {
      const teacherId = 'teacher-b';
      prismaMock.itemBatch.findUnique.mockResolvedValue({ id: 'batch-1' });
      prismaMock.item.findMany.mockResolvedValue([
        { id: 'item-1', secondReview: {} },
        { id: 'item-2', secondReview: {} },
      ]);
      prismaMock.item.count.mockResolvedValue(0); // Không còn câu nào sót lại

      const useCase = new ConfirmAllItemsUseCase(prismaMock);
      const result = await useCase.execute(teacherId, 'batch-1');

      expect(result.success).toBe(true);
      expect(result.confirmedCount).toBe(2);
      expect(result.batchFinalized).toBe(true);
      expect(prismaMock.itemReviewEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          batchId: 'batch-1',
          itemId: null,
          action: ReviewAction.CONFIRM_ALL,
        }),
      });
    });
  });
});
