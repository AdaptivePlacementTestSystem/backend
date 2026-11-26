import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ItemBankController } from './item-bank.controller';
import { UserRole } from '../../auth/domain/enums/user-role.enum';

describe('item bank access', () => {
  it('filters teachers and rejects an item outside their assignments', async () => {
    const service = { listItems: vi.fn(), getItem: vi.fn() };
    const access = {
      allowedIds: vi.fn().mockResolvedValue(['assigned']),
      assertAllowed: vi.fn().mockRejectedValue(new ForbiddenException()),
    };
    const controller = new ItemBankController(
      service as never,
      access as never,
    );
    const teacher = { sub: 'teacher', role: UserRole.TEACHER } as never;
    await controller.listItems(teacher);
    expect(service.listItems).toHaveBeenCalledWith(
      expect.objectContaining({ visibleIds: ['assigned'] }),
    );
    await expect(controller.getItem('other', teacher)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.getItem).not.toHaveBeenCalled();
  });
});
