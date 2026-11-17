import { describe, it, expect } from 'vitest';
import * as ExcelJS from 'exceljs';
import { ExcelJsAccountSpreadsheet } from './exceljs-account-spreadsheet';
import { ImportFileError } from '../domain/import-file.error';
import { makeXlsx } from '../testing/fakes';

describe('ExcelJsAccountSpreadsheet', () => {
  const sheet = new ExcelJsAccountSpreadsheet();

  describe('đọc file', () => {
    it('đọc file sinh viên: số dòng theo Excel, cắt khoảng trắng, bỏ dòng trống', async () => {
      const buffer = await makeXlsx([
        ['MSSV', 'Họ tên', 'Email'],
        [' 20110001 ', ' Nguyễn Văn A ', ' a@example.com '],
        [null, null, null],
        [20110002, 'Trần Thị B', 'b@example.com'],
      ]);

      const rows = await sheet.read(buffer, 'STUDENT');

      expect(rows).toEqual([
        {
          row: 2,
          code: '20110001',
          fullName: 'Nguyễn Văn A',
          email: 'a@example.com',
        },
        {
          row: 4,
          code: '20110002',
          fullName: 'Trần Thị B',
          email: 'b@example.com',
        },
      ]);
    });

    it('MSSV nhập dạng số vẫn đọc ra chuỗi', async () => {
      const rows = await sheet.read(
        await makeXlsx([
          ['MSSV', 'Họ tên', 'Email'],
          [20110003, 'C', 'c@e.com'],
        ]),
        'STUDENT',
      );
      expect(rows[0].code).toBe('20110003');
    });

    it('file giảng viên dùng cột Mã GV', async () => {
      const rows = await sheet.read(
        await makeXlsx([
          ['Mã GV', 'Họ tên', 'Email'],
          ['GV001', 'Lê Văn D', 'd@e.com'],
        ]),
        'TEACHER',
      );
      expect(rows).toEqual([
        { row: 2, code: 'GV001', fullName: 'Lê Văn D', email: 'd@e.com' },
      ]);
    });

    it.each([
      ['mssv', 'ho ten', 'EMAIL'],
      ['MSSV', 'Họ và tên', 'Email'],
      ['  Mssv ', 'HỌ TÊN', 'e-mail'],
    ])(
      'chấp nhận tiêu đề khác hoa thường/dấu: %s | %s | %s',
      async (a, b, c) => {
        const rows = await sheet.read(
          await makeXlsx([
            [a, b, c],
            ['1', 'X', 'x@e.com'],
          ]),
          'STUDENT',
        );
        expect(rows).toHaveLength(1);
      },
    );

    it('chỉ đọc sheet đầu tiên (sheet Hướng dẫn bị bỏ qua)', async () => {
      const workbook = new ExcelJS.Workbook();
      const first = workbook.addWorksheet('Danh sách');
      first.addRow(['MSSV', 'Họ tên', 'Email']);
      first.addRow(['1', 'A', 'a@e.com']);
      workbook.addWorksheet('Hướng dẫn').addRow(['x', 'y', 'z']);
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

      expect(await sheet.read(buffer, 'STUDENT')).toHaveLength(1);
    });

    it('công thức: chỉ lấy văn bản kết quả, không thực thi', async () => {
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('S');
      ws.addRow(['MSSV', 'Họ tên', 'Email']);
      ws.addRow([
        '1',
        'A',
        { formula: 'CONCATENATE("a","@e.com")', result: 'a@e.com' },
      ]);
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

      expect((await sheet.read(buffer, 'STUDENT'))[0].email).toBe('a@e.com');
    });
  });

  describe('file không hợp lệ', () => {
    it('không phải zip/xlsx', async () => {
      await expect(
        sheet.read(Buffer.from('hello,world\n1,2'), 'STUDENT'),
      ).rejects.toThrow(/không phải định dạng \.xlsx/);
    });

    it('rỗng', async () => {
      await expect(
        sheet.read(Buffer.alloc(0), 'STUDENT'),
      ).rejects.toBeInstanceOf(ImportFileError);
    });

    it('chữ ký zip đúng nhưng nội dung hỏng', async () => {
      const broken = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.from('rac'),
      ]);
      await expect(sheet.read(broken, 'STUDENT')).rejects.toThrow(
        /Không đọc được file/,
      );
    });

    it('sai tiêu đề cột: báo cột cần có', async () => {
      const buffer = await makeXlsx([
        ['Mã', 'Tên', 'Thư'],
        ['1', 'A', 'a@e.com'],
      ]);
      await expect(sheet.read(buffer, 'STUDENT')).rejects.toThrow(
        /MSSV, Họ tên, Email/,
      );
    });

    it('dùng file giảng viên cho loại sinh viên (và ngược lại) bị từ chối', async () => {
      const teacherFile = await makeXlsx([
        ['Mã GV', 'Họ tên', 'Email'],
        ['G', 'A', 'a@e.com'],
      ]);
      await expect(sheet.read(teacherFile, 'STUDENT')).rejects.toBeInstanceOf(
        ImportFileError,
      );
      const studentFile = await makeXlsx([
        ['MSSV', 'Họ tên', 'Email'],
        ['1', 'A', 'a@e.com'],
      ]);
      await expect(sheet.read(studentFile, 'TEACHER')).rejects.toBeInstanceOf(
        ImportFileError,
      );
    });
  });

  describe('file mẫu', () => {
    it.each([
      ['STUDENT', ['MSSV', 'Họ tên', 'Email']],
      ['TEACHER', ['Mã GV', 'Họ tên', 'Email']],
    ] as const)(
      'mẫu %s: đúng tiêu đề, không có dòng dữ liệu, đọc lại được bằng chính bộ đọc',
      async (kind, headers) => {
        const buffer = await sheet.buildTemplate(kind);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
        const first = workbook.worksheets[0];
        expect([1, 2, 3].map((i) => first.getRow(1).getCell(i).text)).toEqual([
          ...headers,
        ]);
        expect(workbook.worksheets).toHaveLength(2); // Danh sách + Hướng dẫn
        expect(await sheet.read(buffer, kind)).toEqual([]);
      },
    );
  });
});
