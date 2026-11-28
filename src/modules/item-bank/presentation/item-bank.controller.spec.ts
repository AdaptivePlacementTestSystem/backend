import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ItemBankController } from './item-bank.controller';
import { JwtPayload } from '../../../shared/decorators/current-user.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('ItemBankController', () => {
  let controller: ItemBankController;
  let itemServiceMock: any;

  const teacherUser: JwtPayload = {
    sub: 'teacher-1',
    email: 'teacher1@example.com',
    role: UserRole.TEACHER,
    mustChangePassword: false,
  };

  const adminUser: JwtPayload = {
    sub: 'admin-1',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
    mustChangePassword: false,
  };

  beforeEach(() => {
    itemServiceMock = {
      listItems: vi.fn(),
      getItem: vi.fn(),
      generateExplanation: vi.fn(),
    };
    controller = new ItemBankController(itemServiceMock);
  });

  describe('listItems', () => {
    it('TEACHER: tự động truyền assignedTeacherId = user.sub để lọc câu được phân công (UCGV02/BR-16)', async () => {
      itemServiceMock.listItems.mockResolvedValue({ items: [], total: 0 });

      await controller.listItems(teacherUser);

      expect(itemServiceMock.listItems).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedTeacherId: 'teacher-1',
        }),
      );
    });

    it('ADMIN: không truyền assignedTeacherId để xem toàn bộ ngân hàng câu hỏi', async () => {
      itemServiceMock.listItems.mockResolvedValue({ items: [], total: 0 });

      await controller.listItems(adminUser);

      expect(itemServiceMock.listItems).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedTeacherId: undefined,
        }),
      );
    });
  });

  describe('getItem', () => {
    it('TEACHER: cho phép xem nếu câu được phân công cho mình (reviewerId = teacher-1)', async () => {
      const mockItem = {
        id: 'item-1',
        content: 'Stem',
        reviewerId: 'teacher-1',
        confirmerId: 'other-teacher',
      };
      itemServiceMock.getItem.mockResolvedValue(mockItem);

      const res = await controller.getItem(teacherUser, 'item-1');
      expect(res).toEqual(mockItem);
    });

    it('TEACHER: cho phép xem nếu câu được phân công vai B (confirmerId = teacher-1)', async () => {
      const mockItem = {
        id: 'item-2',
        content: 'Stem',
        reviewerId: 'other-teacher',
        confirmerId: 'teacher-1',
      };
      itemServiceMock.getItem.mockResolvedValue(mockItem);

      const res = await controller.getItem(teacherUser, 'item-2');
      expect(res).toEqual(mockItem);
    });

    it('TEACHER: chặn xem 403 NOT_ASSIGNED nếu không được phân công câu này', async () => {
      const mockItem = {
        id: 'item-3',
        content: 'Stem',
        reviewerId: 'other-1',
        confirmerId: 'other-2',
      };
      itemServiceMock.getItem.mockResolvedValue(mockItem);

      await expect(controller.getItem(teacherUser, 'item-3')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('ADMIN: xem được bất kỳ câu hỏi nào trong ngân hàng', async () => {
      const mockItem = {
        id: 'item-3',
        content: 'Stem',
        reviewerId: 'other-1',
        confirmerId: 'other-2',
      };
      itemServiceMock.getItem.mockResolvedValue(mockItem);

      const res = await controller.getItem(adminUser, 'item-3');
      expect(res).toEqual(mockItem);
    });

    it('ném NotFoundException (404) nếu không tìm thấy câu hỏi', async () => {
      itemServiceMock.getItem.mockResolvedValue(null);

      await expect(
        controller.getItem(teacherUser, 'not-found'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
