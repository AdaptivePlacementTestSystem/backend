import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { ValidationPipe } from '@nestjs/common';
import { ROLES_KEY } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { UserImportController } from './user-import.controller';
import { ImportKindQueryDto, ImportRowParamDto } from './import.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});
const admin = { sub: 'admin-1', role: 'ADMIN', email: 'a@e.com' };

const make = () => {
  const mocks = {
    upload: { execute: vi.fn().mockResolvedValue({}) },
    getGrid: { execute: vi.fn().mockResolvedValue({}) },
    removeRow: { execute: vi.fn().mockResolvedValue({}) },
    clearGrid: { execute: vi.fn().mockResolvedValue(undefined) },
    save: { execute: vi.fn().mockResolvedValue({}) },
    saveStatus: { execute: vi.fn().mockResolvedValue({}) },
    template: {
      execute: vi.fn().mockResolvedValue({
        buffer: Buffer.from('xlsx'),
        filename: 'mau.xlsx',
      }),
    },
  };
  const controller = new UserImportController(
    mocks.upload as any,
    mocks.getGrid as any,
    mocks.removeRow as any,
    mocks.clearGrid as any,
    mocks.save as any,
    mocks.saveStatus as any,
    mocks.template as any,
  );
  return { controller, ...mocks };
};

describe('UserImportController', () => {
  it('chỉ ADMIN được truy cập (BR-16)', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UserImportController)).toEqual([
      UserRole.ADMIN,
    ]);
  });

  it('mọi thao tác dùng id của Admin đang đăng nhập và đúng loại (lưới khóa theo adminId + kind)', async () => {
    const {
      controller,
      upload,
      getGrid,
      removeRow,
      clearGrid,
      save,
      saveStatus,
    } = make();
    const file = { buffer: Buffer.from('x'), size: 1, originalname: 'a.xlsx' };

    await controller.uploadFile({ kind: 'TEACHER' }, file, admin);
    await controller.grid({ kind: 'STUDENT' }, admin);
    await controller.deleteRow({ rowKey: 'k1' }, { kind: 'STUDENT' }, admin);
    await controller.deleteGrid({ kind: 'TEACHER' }, admin);
    await controller.saveGrid({ kind: 'STUDENT' }, admin);
    await controller.status({ kind: 'STUDENT' }, admin);

    expect(upload.execute).toHaveBeenCalledWith({
      adminId: 'admin-1',
      kind: 'TEACHER',
      file,
    });
    expect(getGrid.execute).toHaveBeenCalledWith('admin-1', 'STUDENT');
    expect(removeRow.execute).toHaveBeenCalledWith('admin-1', 'STUDENT', 'k1');
    expect(clearGrid.execute).toHaveBeenCalledWith('admin-1', 'TEACHER');
    expect(save.execute).toHaveBeenCalledWith('admin-1', 'STUDENT');
    expect(saveStatus.execute).toHaveBeenCalledWith('admin-1', 'STUDENT');
  });

  it('tải mẫu: gửi file xlsx kèm tên tệp', async () => {
    const { controller, template } = make();
    const res = { setHeader: vi.fn(), send: vi.fn() };

    await controller.downloadTemplate({ kind: 'STUDENT' }, res as any);

    expect(template.execute).toHaveBeenCalledWith('STUDENT');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="mau.xlsx"',
    );
    expect(res.send).toHaveBeenCalledWith(Buffer.from('xlsx'));
  });

  describe('kiểm tra tham số', () => {
    const query = (value: unknown) =>
      pipe.transform(value, { type: 'query', metatype: ImportKindQueryDto });

    it('kind chỉ nhận STUDENT hoặc TEACHER', async () => {
      await expect(query({ kind: 'STUDENT' })).resolves.toBeInstanceOf(
        ImportKindQueryDto,
      );
      await expect(query({ kind: 'TEACHER' })).resolves.toBeInstanceOf(
        ImportKindQueryDto,
      );
      await expect(query({ kind: 'ADMIN' })).rejects.toBeDefined();
      await expect(query({})).rejects.toBeDefined();
      await expect(query({ kind: 'student' })).rejects.toBeDefined();
    });

    it('rowKey phải là UUID', async () => {
      const param = (value: unknown) =>
        pipe.transform(value, { type: 'param', metatype: ImportRowParamDto });
      await expect(param({ rowKey: randomUUID() })).resolves.toBeDefined();
      await expect(param({ rowKey: '../x' })).rejects.toBeDefined();
    });
  });
});
