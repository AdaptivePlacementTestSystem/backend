import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException } from '@nestjs/common';
import { ErrorCode } from '@apt/shared-types';
import { UploadImportFileUseCase } from './upload-import-file.use-case';
import { ImportFileError } from '../../domain/import-file.error';
import { FakeGridStore, FakeSpreadsheet } from '../../testing/fakes';
import type { RawImportRow } from '../../domain/import.types';

const ADMIN = 'admin-1';
const file = (size = 100) => ({
  buffer: Buffer.from('x'),
  size,
  originalname: 'a.xlsx',
});
const raw = (
  row: number,
  code: string,
  fullName: string,
  email: string,
): RawImportRow => ({
  row,
  code,
  fullName,
  email,
});

describe('UploadImportFileUseCase', () => {
  let grid: FakeGridStore;
  let sheet: FakeSpreadsheet;
  let users: any;
  let useCase: UploadImportFileUseCase;
  const config = {
    maxFileBytes: 2 * 1024 * 1024,
    maxRows: 1000,
    hashConcurrency: 4,
  };

  beforeEach(() => {
    grid = new FakeGridStore();
    sheet = new FakeSpreadsheet();
    users = {
      findTakenEmails: vi.fn().mockResolvedValue(new Set<string>()),
      findTakenCodes: vi.fn().mockResolvedValue(new Set<string>()),
    };
    useCase = new UploadImportFileUseCase(users, grid, sheet, config);
  });

  const run = (kind: 'STUDENT' | 'TEACHER' = 'STUDENT', f: any = file()) =>
    useCase.execute({ adminId: ADMIN, kind, file: f });

  it('dòng hợp lệ vào lưới: có rowKey, email chữ thường; chưa ghi DB', async () => {
    sheet.rows = [
      raw(2, '20110001', 'Nguyễn Văn A', 'A@Example.COM'),
      raw(3, '20110002', 'B', 'b@e.com'),
    ];

    const result = await run();

    expect(result.added).toBe(2);
    expect(result.grid).toHaveLength(2);
    expect(result.grid[0]).toMatchObject({
      code: '20110001',
      fullName: 'Nguyễn Văn A',
      email: 'a@example.com',
    });
    expect(result.grid[0].rowKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.rejected).toEqual([]);
    expect(await grid.load(ADMIN, 'STUDENT')).toHaveLength(2);
  });

  describe('dòng bị loại (BR-03), kèm số dòng trong file', () => {
    it.each([
      [raw(2, '', 'A', 'a@e.com'), 'MISSING_FIELD'],
      [raw(2, '1', '', 'a@e.com'), 'MISSING_FIELD'],
      [raw(2, '1', 'A', ''), 'MISSING_FIELD'],
      [raw(2, '1', 'A', 'khong-phai-email'), 'INVALID_EMAIL'],
      [raw(2, '1', 'A', 'a@'), 'INVALID_EMAIL'],
    ])('%j → %s', async (row, code) => {
      sheet.rows = [row];

      const result = await run();

      expect(result.added).toBe(0);
      expect(result.rejected).toEqual([
        { row: 2, code, reason: expect.any(String) },
      ]);
    });

    it('trùng email hoặc mã với dòng trước trong cùng file: loại dòng sau', async () => {
      sheet.rows = [
        raw(2, '1', 'A', 'a@e.com'),
        raw(3, '2', 'B', 'A@E.COM'), // trùng email (khác hoa thường)
        raw(4, '1', 'C', 'c@e.com'), // trùng mã
        raw(5, '3', 'D', 'd@e.com'),
      ];

      const result = await run();

      expect(result.grid.map((r) => r.code)).toEqual(['1', '3']);
      expect(result.rejected.map((r) => [r.row, r.code])).toEqual([
        [3, 'DUPLICATE_IN_FILE'],
        [4, 'DUPLICATE_IN_FILE'],
      ]);
    });

    it('dòng lỗi không chặn các dòng tốt', async () => {
      sheet.rows = [raw(2, '1', 'A', 'sai'), raw(3, '2', 'B', 'b@e.com')];

      const result = await run();

      expect(result.added).toBe(1);
      expect(result.grid[0].code).toBe('2');
    });
  });

  describe('trùng tài khoản đã có (popup riêng, không vào lưới, không chặn Lưu)', () => {
    it('email đã có → existing field=email', async () => {
      sheet.rows = [raw(2, '1', 'A', 'dat@e.com'), raw(3, '2', 'B', 'b@e.com')];
      users.findTakenEmails.mockResolvedValue(new Set(['dat@e.com']));

      const result = await run();

      expect(result.existing).toEqual([
        { row: 2, field: 'email', value: 'dat@e.com' },
      ]);
      expect(result.grid.map((r) => r.code)).toEqual(['2']);
    });

    it('MSSV/mã GV đã có → existing field=code, tra đúng loại', async () => {
      sheet.rows = [raw(2, 'GV1', 'A', 'a@e.com')];
      users.findTakenCodes.mockResolvedValue(new Set(['GV1']));

      const result = await run('TEACHER');

      expect(result.existing).toEqual([
        { row: 2, field: 'code', value: 'GV1' },
      ]);
      expect(users.findTakenCodes).toHaveBeenCalledWith('TEACHER', ['GV1']);
      expect(result.grid).toEqual([]);
    });

    it('chỉ tra DB các dòng đã qua kiểm tra (không tra dòng lỗi)', async () => {
      sheet.rows = [raw(2, '1', 'A', 'sai'), raw(3, '2', 'B', 'b@e.com')];

      await run();

      expect(users.findTakenEmails).toHaveBeenCalledWith(['b@e.com']);
    });
  });

  describe('gộp nhiều file vào một lưới', () => {
    it('tải file thứ hai: cộng dồn; dòng đã có trong lưới bị bỏ qua và đếm', async () => {
      sheet.rows = [raw(2, '1', 'A', 'a@e.com'), raw(3, '2', 'B', 'b@e.com')];
      await run();

      sheet.rows = [raw(2, '2', 'B', 'b@e.com'), raw(3, '3', 'C', 'c@e.com')];
      const second = await run();

      expect(second.added).toBe(1);
      expect(second.ignoredDuplicates).toBe(1);
      expect(second.grid.map((r) => r.code)).toEqual(['1', '2', '3']);
      expect(second.rejected).toEqual([]);
    });

    it('trùng với lưới theo email (mã khác) cũng bị bỏ qua', async () => {
      sheet.rows = [raw(2, '1', 'A', 'a@e.com')];
      await run();
      sheet.rows = [raw(2, '9', 'A2', 'a@e.com')];

      const second = await run();

      expect(second.ignoredDuplicates).toBe(1);
      expect(second.grid).toHaveLength(1);
    });

    it('mỗi loại một lưới riêng: lưới SV không lẫn lưới GV', async () => {
      sheet.rows = [raw(2, '1', 'A', 'a@e.com')];
      await run('STUDENT');
      sheet.rows = [raw(2, 'GV1', 'B', 'b@e.com')];
      const teacher = await run('TEACHER');

      expect(teacher.grid).toHaveLength(1);
      expect(await grid.load(ADMIN, 'STUDENT')).toHaveLength(1);
    });

    it('mỗi Admin một lưới riêng', async () => {
      sheet.rows = [raw(2, '1', 'A', 'a@e.com')];
      await run();
      const other = await useCase.execute({
        adminId: 'admin-2',
        kind: 'STUDENT',
        file: file(),
      });

      expect(other.grid).toHaveLength(1);
      expect(other.added).toBe(1);
    });
  });

  describe('giới hạn và file sai', () => {
    const expectInvalid = async (promise: Promise<unknown>, status: number) => {
      const error: any = await promise.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(status);
      expect(error.getResponse()).toMatchObject({
        code: ErrorCode.IMPORT_FILE_INVALID,
      });
    };

    it('không có file: 400 IMPORT_FILE_INVALID', async () => {
      await expectInvalid(run('STUDENT', null), 400); // null: không truyền file (undefined sẽ dùng giá trị mặc định)
    });

    it('quá dung lượng: 413 IMPORT_FILE_INVALID', async () => {
      await expectInvalid(run('STUDENT', file(2 * 1024 * 1024 + 1)), 413);
    });

    it('file đúng 2 MB vẫn nhận', async () => {
      sheet.rows = [raw(2, '1', 'A', 'a@e.com')];
      await expect(
        run('STUDENT', file(2 * 1024 * 1024)),
      ).resolves.toBeDefined();
    });

    it('lỗi đọc file (ImportFileError) đổi thành 400 kèm mã nghiệp vụ', async () => {
      sheet.read = () =>
        Promise.reject(new ImportFileError('Sai tiêu đề cột.'));
      await expectInvalid(run(), 400);
    });

    it('quá 1000 dòng trong một file: 400', async () => {
      sheet.rows = Array.from({ length: 1001 }, (_, i) =>
        raw(i + 2, `${i}`, 'A', `u${i}@e.com`),
      );
      await expectInvalid(run(), 400);
      expect(await grid.load(ADMIN, 'STUDENT')).toBeNull();
    });

    it('đúng 1000 dòng nhận được; tải thêm làm lưới vượt 1000 thì từ chối cả file, lưới giữ nguyên', async () => {
      sheet.rows = Array.from({ length: 1000 }, (_, i) =>
        raw(i + 2, `${i}`, 'A', `u${i}@e.com`),
      );
      expect((await run()).added).toBe(1000);

      sheet.rows = [raw(2, 'new', 'B', 'new@e.com')];
      await expectInvalid(run(), 400);
      expect(await grid.load(ADMIN, 'STUDENT')).toHaveLength(1000);
    });

    it('lỗi hệ thống không phải ImportFileError được ném lại nguyên vẹn', async () => {
      sheet.read = () => Promise.reject(new Error('boom'));
      await expect(run()).rejects.toThrow('boom');
    });
  });

  it('TTL được làm mới kể cả khi file không thêm dòng nào (ghi lại lưới)', async () => {
    sheet.rows = [raw(2, '1', 'A', 'a@e.com')];
    await run();
    const spy = vi.spyOn(grid, 'store');

    sheet.rows = [raw(2, '1', 'A', 'a@e.com')];
    await run();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
