import { describe, it, expect, vi } from 'vitest';
import { ValidationPipe } from '@nestjs/common';
import { ROLES_KEY } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { AccountActionsController } from './account-actions.controller';
import { ChangeRoleDto } from '../application/dto/change-role.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

describe('AccountActionsController', () => {
  const makeController = () => {
    const set = { execute: vi.fn().mockResolvedValue({}) };
    const resend = { execute: vi.fn().mockResolvedValue({}) };
    const role = { execute: vi.fn().mockResolvedValue({}) };
    return {
      set,
      resend,
      role,
      controller: new AccountActionsController(
        set as any,
        resend as any,
        role as any,
      ),
    };
  };
  const actor = { sub: 'admin-1', role: 'ADMIN', email: 'a@e.com' };

  it('chỉ ADMIN được truy cập (BR-16)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AccountActionsController)).toEqual([
      UserRole.ADMIN,
    ]);
  });

  it('lock/unlock truyền id người thao tác và đích, cờ isActive đúng', async () => {
    const { controller, set } = makeController();

    await controller.lock('t-1', actor);
    await controller.unlock('t-2', actor);

    expect(set.execute).toHaveBeenNthCalledWith(1, {
      actorId: 'admin-1',
      targetId: 't-1',
      isActive: false,
    });
    expect(set.execute).toHaveBeenNthCalledWith(2, {
      actorId: 'admin-1',
      targetId: 't-2',
      isActive: true,
    });
  });

  it('gửi lại mật khẩu tạm và đổi role gọi đúng use-case', async () => {
    const { controller, resend, role } = makeController();

    await controller.resend('t-1');
    await controller.changeRole('t-2', { role: UserRole.ADMIN }, actor);

    expect(resend.execute).toHaveBeenCalledWith('t-1');
    expect(role.execute).toHaveBeenCalledWith({
      actorId: 'admin-1',
      targetId: 't-2',
      role: UserRole.ADMIN,
    });
  });

  it('DTO đổi role chỉ nhận ADMIN hoặc TEACHER, không nhận trường lạ', async () => {
    const run = (value: unknown) =>
      pipe.transform(value, { type: 'body', metatype: ChangeRoleDto });

    await expect(run({ role: 'ADMIN' })).resolves.toBeInstanceOf(ChangeRoleDto);
    await expect(run({ role: 'TEACHER' })).resolves.toBeInstanceOf(
      ChangeRoleDto,
    );
    await expect(run({ role: 'STUDENT' })).rejects.toBeDefined();
    await expect(run({ role: 'EDUZ_SERVICE' })).rejects.toBeDefined();
    await expect(run({ role: 'ADMIN', isActive: true })).rejects.toBeDefined();
    await expect(run({})).rejects.toBeDefined();
  });
});
