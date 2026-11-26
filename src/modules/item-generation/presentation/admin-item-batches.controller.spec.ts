import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminItemBatchesController } from './admin-item-batches.controller';
import { GetAdminBatchUseCase } from '../application/get-admin-batch.use-case';
import { ROLES_KEY } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';

describe('AdminItemBatchesController', () => {
  it('chỉ khai báo quyền ADMIN cho chi tiết lô', () => {
    const method = Object.getOwnPropertyDescriptor(
      AdminItemBatchesController.prototype,
      'getDetail',
    )?.value as object;
    expect(Reflect.getMetadata(ROLES_KEY, method)).toEqual([UserRole.ADMIN]);
    const list = Object.getOwnPropertyDescriptor(
      AdminItemBatchesController.prototype,
      'list',
    )?.value as object;
    expect(Reflect.getMetadata(ROLES_KEY, list)).toEqual([UserRole.ADMIN]);
  });
  it('giới hạn phân trang và dùng giá trị mặc định', async () => {
    const execute = vi.fn();
    const controller = new AdminItemBatchesController({
      execute,
    } as unknown as GetAdminBatchUseCase);
    await controller.getDetail('id');
    expect(execute).toHaveBeenCalledWith('id', 1, 20);
    expect(() => controller.getDetail('id', '0', '20')).toThrow(
      BadRequestException,
    );
    expect(() => controller.getDetail('id', '1', '101')).toThrow(
      BadRequestException,
    );
    expect(() => controller.getDetail('id', '1e3', '20')).toThrow(
      BadRequestException,
    );
  });
});
