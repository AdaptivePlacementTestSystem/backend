import { describe, it, expect, beforeEach } from 'vitest';
import {
  ClearImportGridUseCase,
  GetImportGridUseCase,
  RemoveImportRowUseCase,
} from './import-grid.use-cases';
import { FakeGridStore } from '../../testing/fakes';

const rows = [
  { rowKey: 'k1', code: '1', fullName: 'A', email: 'a@e.com' },
  { rowKey: 'k2', code: '2', fullName: 'B', email: 'b@e.com' },
];

describe('lưới tạm: xem, xóa dòng, xóa cả lưới', () => {
  let grid: FakeGridStore;

  beforeEach(async () => {
    grid = new FakeGridStore();
    await grid.store('admin', 'STUDENT', rows);
  });

  it('xem lưới; chưa có hoặc hết hạn thì rỗng', async () => {
    const get = new GetImportGridUseCase(grid);

    expect((await get.execute('admin', 'STUDENT')).grid).toHaveLength(2);
    expect((await get.execute('admin', 'TEACHER')).grid).toEqual([]);
    expect((await get.execute('other', 'STUDENT')).grid).toEqual([]);
  });

  it('xóa một dòng theo rowKey', async () => {
    const result = await new RemoveImportRowUseCase(grid).execute(
      'admin',
      'STUDENT',
      'k1',
    );

    expect(result.grid.map((r) => r.rowKey)).toEqual(['k2']);
    expect(await grid.load('admin', 'STUDENT')).toHaveLength(1);
  });

  it('xóa dòng không tồn tại: không đổi gì', async () => {
    const result = await new RemoveImportRowUseCase(grid).execute(
      'admin',
      'STUDENT',
      'nope',
    );

    expect(result.grid).toHaveLength(2);
  });

  it('xóa dòng cuối: lưới vẫn tồn tại nhưng rỗng (để phân biệt với hết hạn khi Lưu)', async () => {
    const remove = new RemoveImportRowUseCase(grid);
    await remove.execute('admin', 'STUDENT', 'k1');
    await remove.execute('admin', 'STUDENT', 'k2');

    expect(await grid.load('admin', 'STUDENT')).toEqual([]);
  });

  it('xóa dòng khi lưới đã hết hạn: trả rỗng, không tạo lưới mới', async () => {
    const result = await new RemoveImportRowUseCase(grid).execute(
      'admin',
      'TEACHER',
      'k1',
    );

    expect(result.grid).toEqual([]);
    expect(await grid.load('admin', 'TEACHER')).toBeNull();
  });

  it('xóa cả lưới chỉ ảnh hưởng đúng loại và đúng Admin', async () => {
    await grid.store('admin', 'TEACHER', rows);
    await grid.store('other', 'STUDENT', rows);

    await new ClearImportGridUseCase(grid).execute('admin', 'STUDENT');

    expect(await grid.load('admin', 'STUDENT')).toBeNull();
    expect(await grid.load('admin', 'TEACHER')).toHaveLength(2);
    expect(await grid.load('other', 'STUDENT')).toHaveLength(2);
  });
});
