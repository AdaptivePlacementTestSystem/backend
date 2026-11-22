import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeacherReviewController } from './teacher-review.controller';
import { JwtPayload } from '../../../shared/decorators/current-user.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { ItemStatus } from '@apt/shared-types';

describe('TeacherReviewController', () => {
  let controller: TeacherReviewController;
  let getReviewTasksMock: any;
  let getBatchItemsReviewMock: any;
  let editItemMock: any;
  let reviewItemMock: any;
  let getConfirmTasksMock: any;
  let getBatchItemsConfirmMock: any;
  let confirmItemMock: any;
  let confirmAllItemsMock: any;

  const mockTeacher: JwtPayload = {
    sub: 'teacher-uuid',
    email: 'teacher@example.com',
    role: UserRole.TEACHER,
    mustChangePassword: false,
  };

  beforeEach(() => {
    getReviewTasksMock = { execute: vi.fn() };
    getBatchItemsReviewMock = { execute: vi.fn() };
    editItemMock = { execute: vi.fn() };
    reviewItemMock = { execute: vi.fn() };
    getConfirmTasksMock = { execute: vi.fn() };
    getBatchItemsConfirmMock = { execute: vi.fn() };
    confirmItemMock = { execute: vi.fn() };
    confirmAllItemsMock = { execute: vi.fn() };

    controller = new TeacherReviewController(
      getReviewTasksMock,
      getBatchItemsReviewMock,
      editItemMock,
      reviewItemMock,
      getConfirmTasksMock,
      getBatchItemsConfirmMock,
      confirmItemMock,
      confirmAllItemsMock,
    );
  });

  it('GET /teacher/tasks/reviews gọi GetTeacherReviewTasksUseCase với user.sub', async () => {
    getReviewTasksMock.execute.mockResolvedValue({ batches: [], stats: { pendingReviews: 0, pendingConfirms: 0 } });
    const res = await controller.getReviewTasks(mockTeacher);
    expect(getReviewTasksMock.execute).toHaveBeenCalledWith(mockTeacher.sub);
    expect(res.batches).toEqual([]);
  });

  it('GET /teacher/tasks/reviews/:batchId gọi GetBatchItemsForReviewUseCase', async () => {
    getBatchItemsReviewMock.execute.mockResolvedValue({ batchId: 'b-1', items: [] });
    const res = await controller.getBatchItemsForReview('b-1', mockTeacher);
    expect(getBatchItemsReviewMock.execute).toHaveBeenCalledWith(mockTeacher.sub, 'b-1');
    expect(res.batchId).toBe('b-1');
  });

  it('PATCH /teacher/items/:id gọi EditItemUseCase (UCGV04)', async () => {
    editItemMock.execute.mockResolvedValue({ id: 'item-1', content: 'New' });
    const res = await controller.editItem('item-1', { content: 'New' }, mockTeacher);
    expect(editItemMock.execute).toHaveBeenCalledWith(mockTeacher.sub, 'item-1', { content: 'New' });
    expect(res.content).toBe('New');
  });

  it('POST /teacher/items/:id/approve gọi ReviewItemUseCase với APPROVE (UCGV14)', async () => {
    reviewItemMock.execute.mockResolvedValue({ success: true, itemId: 'item-1', status: ItemStatus.FIRST_APPROVED });
    const res = await controller.approveItem('item-1', { comment: 'OK' }, mockTeacher);
    expect(reviewItemMock.execute).toHaveBeenCalledWith(mockTeacher.sub, 'item-1', 'APPROVE', 'OK');
    expect(res.status).toBe(ItemStatus.FIRST_APPROVED);
  });

  it('POST /teacher/items/:id/reject gọi ReviewItemUseCase với REJECT (UCGV14)', async () => {
    reviewItemMock.execute.mockResolvedValue({ success: true, itemId: 'item-1', status: ItemStatus.REJECTED });
    const res = await controller.rejectItem('item-1', {}, mockTeacher);
    expect(reviewItemMock.execute).toHaveBeenCalledWith(mockTeacher.sub, 'item-1', 'REJECT', undefined);
    expect(res.status).toBe(ItemStatus.REJECTED);
  });

  it('POST /teacher/items/:id/confirm gọi ConfirmItemUseCase với CONFIRM (UCGV15)', async () => {
    confirmItemMock.execute.mockResolvedValue({ success: true, itemId: 'item-1', status: ItemStatus.SECOND_APPROVED });
    const res = await controller.confirmItem('item-1', { comment: 'Đạt' }, mockTeacher);
    expect(confirmItemMock.execute).toHaveBeenCalledWith(mockTeacher.sub, 'item-1', 'CONFIRM', 'Đạt');
    expect(res.status).toBe(ItemStatus.SECOND_APPROVED);
  });

  it('POST /teacher/items/:id/remove gọi ConfirmItemUseCase với REMOVE (UCGV15)', async () => {
    confirmItemMock.execute.mockResolvedValue({ success: true, itemId: 'item-1', status: ItemStatus.REJECTED });
    const res = await controller.removeItem('item-1', { comment: 'Lỗi' }, mockTeacher);
    expect(confirmItemMock.execute).toHaveBeenCalledWith(mockTeacher.sub, 'item-1', 'REMOVE', 'Lỗi');
    expect(res.status).toBe(ItemStatus.REJECTED);
  });

  it('POST /teacher/tasks/confirms/:batchId/confirm-all gọi ConfirmAllItemsUseCase (UCGV15)', async () => {
    confirmAllItemsMock.execute.mockResolvedValue({ success: true, confirmedCount: 5, batchFinalized: true });
    const res = await controller.confirmAllRemaining('batch-1', mockTeacher);
    expect(confirmAllItemsMock.execute).toHaveBeenCalledWith(mockTeacher.sub, 'batch-1');
    expect(res.confirmedCount).toBe(5);
  });
});
