import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
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
        findUniqueOrThrow: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },
      itemBatch: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'batch-1',
          status: ItemBatchStatus.IN_REVIEW,
          confirmerId: 'teacher-b',
        }),
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
          firstReview: {
            dueAt: '2026-11-25T23:59:59Z',
            action: ReviewAction.APPROVE,
          },
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
        batchId: 'batch-1',
        batch: { id: 'batch-1', status: ItemBatchStatus.IN_REVIEW },
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
      prismaMock.item.findUniqueOrThrow.mockResolvedValue({
        ...existingItem,
        content: 'Updated stem',
        options: { A: '10', B: '20', C: '30', D: '40' },
      });
      prismaMock.explanation.findUnique.mockResolvedValue({
        content: 'Original explanation',
      });

      const useCase = new EditItemUseCase(prismaMock);
      const result = await useCase.execute(teacherId, 'item-1', {
        content: 'Updated stem',
        options: { A: '10', B: '20', C: '30', D: '40' },
      });

      expect(result.hasEdited).toBe(true);
      expect(prismaMock.itemReviewEvent.create).not.toHaveBeenCalled();
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
        batchId: 'batch-1',
        batch: { id: 'batch-1', status: ItemBatchStatus.IN_REVIEW },
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
        batchId: 'batch-1',
        batch: { id: 'batch-1', status: ItemBatchStatus.IN_REVIEW },
        reviewerId: 'teacher-1',
        status: ItemStatus.FIRST_APPROVED,
      });

      const useCase = new EditItemUseCase(prismaMock);
      await expect(
        useCase.execute('teacher-1', 'item-1', { content: 'New' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GetBatchItemsForReviewUseCase / ConfirmTasks / GetBatchItemsForConfirm (WP-2.1)', () => {
    it('GetBatchItemsForReviewUseCase ném NotFoundException nếu lô không tồn tại', async () => {
      prismaMock.itemBatch.findUnique.mockResolvedValue(null);
      const useCase = new GetBatchItemsForReviewUseCase(prismaMock);
      await expect(useCase.execute('teacher-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('GetTeacherConfirmTasksUseCase lọc theo batch.confirmerId (không đọc item.confirmerId)', async () => {
      prismaMock.item.findMany.mockResolvedValue([]);
      prismaMock.item.count.mockResolvedValue(0);

      const useCase = new GetTeacherConfirmTasksUseCase(prismaMock);
      await useCase.execute('teacher-b');

      expect(prismaMock.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            batch: { confirmerId: 'teacher-b' },
          }),
        }),
      );
    });

    it('GetBatchItemsForConfirmUseCase chặn B cũ với 403 NOT_ASSIGNED khi batch.confirmerId đã đổi', async () => {
      prismaMock.itemBatch.findUnique.mockResolvedValue({
        id: 'batch-1',
        name: 'Lô 1',
        confirmerId: 'new-teacher-b',
      });

      const useCase = new GetBatchItemsForConfirmUseCase(prismaMock);
      await expect(useCase.execute('old-teacher-b', 'batch-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('ReviewItemUseCase (UCGV14)', () => {
    it('duyệt câu hỏi chuyển trạng thái sang FIRST_APPROVED và ghi log kiểm toán', async () => {
      const teacherId = 'teacher-1';
      prismaMock.item.findUnique.mockResolvedValue({
        id: 'item-1',
        batchId: 'batch-1',
        batch: { id: 'batch-1', status: ItemBatchStatus.IN_REVIEW },
        reviewerId: teacherId,
        status: ItemStatus.DRAFT,
        content: 'Sample stem',
        options: { A: '1', B: '2', C: '3', D: '4' },
        firstReview: {},
      });
      prismaMock.item.count
        .mockResolvedValueOnce(0) // remainingUnfinished
        .mockResolvedValueOnce(1); // còn câu SECOND_APPROVED -> READY_TO_FINALIZE

      const useCase = new ReviewItemUseCase(prismaMock);
      const result = await useCase.execute(
        teacherId,
        'item-1',
        'APPROVE',
        'Câu tốt',
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(ItemStatus.FIRST_APPROVED);
      expect(prismaMock.item.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'item-1',
            reviewerId: teacherId,
            status: ItemStatus.DRAFT,
          }),
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

    it('chặn duyệt nếu phát hiện trùng lặp sau sửa (BR-27 DUPLICATE_AFTER_EDIT)', async () => {
      const teacherId = 'teacher-1';
      prismaMock.item.findUnique.mockResolvedValue({
        id: 'item-1',
        batchId: 'batch-1',
        batch: { id: 'batch-1', status: ItemBatchStatus.IN_REVIEW },
        reviewerId: teacherId,
        status: ItemStatus.DRAFT,
        contentHash: 'hash-dup',
        content: 'Duplicate stem',
        options: { A: '1', B: '2', C: '3', D: '4' },
      });
      // Giả lập phát hiện câu trùng
      prismaMock.item.findFirst.mockResolvedValue({ id: 'item-dup' });

      const useCase = new ReviewItemUseCase(prismaMock);
      await expect(
        useCase.execute(teacherId, 'item-1', 'APPROVE'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('ném lỗi ConflictException khi thao tác đồng thời làm thay đổi trạng thái trước', async () => {
      const teacherId = 'teacher-1';
      prismaMock.item.findUnique.mockResolvedValue({
        id: 'item-1',
        batchId: 'batch-1',
        batch: { id: 'batch-1', status: ItemBatchStatus.IN_REVIEW },
        reviewerId: teacherId,
        status: ItemStatus.DRAFT,
        content: 'Stem',
        options: { A: '1', B: '2', C: '3', D: '4' },
      });
      // updateMany trả về count: 0 (bị tranh chấp ghi đè)
      prismaMock.item.updateMany.mockResolvedValue({ count: 0 });

      const useCase = new ReviewItemUseCase(prismaMock);
      await expect(
        useCase.execute(teacherId, 'item-1', 'APPROVE'),
      ).rejects.toThrow(ConflictException);
    });

    it('chặn REJECT nếu comment rỗng hoặc chỉ toàn khoảng trắng (WP-7.1)', async () => {
      const useCase = new ReviewItemUseCase(prismaMock);
      await expect(
        useCase.execute('teacher-1', 'item-1', 'REJECT', '   '),
      ).rejects.toThrow(BadRequestException);
    });

    it('từ chối câu cuối cùng khi còn 0 câu SECOND_APPROVED -> chuyển thẳng lô sang DONE (WP-6.1)', async () => {
      const teacherId = 'teacher-1';
      prismaMock.item.findUnique.mockResolvedValue({
        id: 'item-1',
        batchId: 'batch-1',
        batch: { id: 'batch-1', status: ItemBatchStatus.IN_REVIEW },
        reviewerId: teacherId,
        status: ItemStatus.DRAFT,
        content: 'Sample stem',
        options: { A: '1', B: '2', C: '3', D: '4' },
        firstReview: {},
      });
      prismaMock.item.count
        .mockResolvedValueOnce(0) // remainingUnfinished = 0
        .mockResolvedValueOnce(0); // secondApprovedCount = 0 -> DONE

      const useCase = new ReviewItemUseCase(prismaMock);
      const result = await useCase.execute(
        teacherId,
        'item-1',
        'REJECT',
        'Sai kiến thức ngữ pháp',
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(ItemStatus.REJECTED);
      expect(result.batchFinalized).toBe(true);
      expect(prismaMock.itemBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: { status: ItemBatchStatus.DONE },
      });
      expect(prismaMock.itemReviewEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: ReviewAction.REJECT,
          details: { comment: 'Sai kiến thức ngữ pháp' },
        }),
      });
    });
  });

  describe('ConfirmItemUseCase (UCGV15)', () => {
    it('GV B xác nhận câu chuyển sang SECOND_APPROVED và tự động chốt lô READY_TO_FINALIZE nếu còn >= 1 câu SECOND_APPROVED', async () => {
      const teacherId = 'teacher-b';
      prismaMock.item.findUnique.mockResolvedValue({
        id: 'item-1',
        batchId: 'batch-1',
        batch: {
          id: 'batch-1',
          status: ItemBatchStatus.IN_REVIEW,
          confirmerId: teacherId,
        },
        status: ItemStatus.FIRST_APPROVED,
        secondReview: {},
      });
      prismaMock.item.count
        .mockResolvedValueOnce(0) // remainingUnfinished = 0
        .mockResolvedValueOnce(1); // >= 1 SECOND_APPROVED -> READY_TO_FINALIZE

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

    it('chặn GV B cũ (không còn là batch.confirmerId) với ForbiddenException (WP-2.1)', async () => {
      prismaMock.item.findUnique.mockResolvedValue({
        id: 'item-1',
        batchId: 'batch-1',
        batch: {
          id: 'batch-1',
          status: ItemBatchStatus.IN_REVIEW,
          confirmerId: 'new-teacher-b',
        },
        status: ItemStatus.FIRST_APPROVED,
        secondReview: {},
      });

      const useCase = new ConfirmItemUseCase(prismaMock);
      await expect(
        useCase.execute('old-teacher-b', 'item-1', 'CONFIRM'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('chặn REMOVE nếu thiếu comment hoặc chỉ toàn khoảng trắng (WP-7.1)', async () => {
      const useCase = new ConfirmItemUseCase(prismaMock);
      await expect(
        useCase.execute('teacher-b', 'item-1', 'REMOVE', '  '),
      ).rejects.toThrow(BadRequestException);
    });

    it('GV B loại bỏ câu chuyển sang REJECTED', async () => {
      const teacherId = 'teacher-b';
      prismaMock.item.findUnique.mockResolvedValue({
        id: 'item-1',
        batchId: 'batch-1',
        batch: {
          id: 'batch-1',
          status: ItemBatchStatus.IN_REVIEW,
          confirmerId: teacherId,
        },
        status: ItemStatus.FIRST_APPROVED,
        secondReview: {},
      });
      prismaMock.item.count.mockResolvedValue(2); // còn câu khác chưa xong

      const useCase = new ConfirmItemUseCase(prismaMock);
      const result = await useCase.execute(
        teacherId,
        'item-1',
        'REMOVE',
        'Không đạt chuẩn B2',
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe(ItemStatus.REJECTED);
      expect(result.batchFinalized).toBe(false);
    });
  });

  describe('ConfirmAllItemsUseCase (UCGV15)', () => {
    it('xác nhận hàng loạt tất cả câu FIRST_APPROVED trong lô và ghi log CONFIRM_ALL', async () => {
      const teacherId = 'teacher-b';
      prismaMock.itemBatch.findUnique.mockResolvedValue({
        id: 'batch-1',
        status: ItemBatchStatus.IN_REVIEW,
        confirmerId: teacherId,
      });
      prismaMock.item.findMany.mockResolvedValue([
        { id: 'item-1', secondReview: {} },
        { id: 'item-2', secondReview: {} },
      ]);
      prismaMock.item.count
        .mockResolvedValueOnce(0) // remainingUnfinished
        .mockResolvedValueOnce(2); // 2 câu SECOND_APPROVED -> READY_TO_FINALIZE

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
          details: {
            updatedCount: 2,
            itemIds: ['item-1', 'item-2'],
          },
        }),
      });
    });

    it('chặn ConfirmAll khi lô không ở trạng thái IN_REVIEW (ConflictException)', async () => {
      prismaMock.itemBatch.findUnique.mockResolvedValue({
        id: 'batch-1',
        status: ItemBatchStatus.DONE,
        confirmerId: 'teacher-b',
      });

      const useCase = new ConfirmAllItemsUseCase(prismaMock);
      await expect(useCase.execute('teacher-b', 'batch-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
