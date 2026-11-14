import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ImportFileError } from '../domain/import-file.error';
import type { ImportKind, RawImportRow } from '../domain/import.types';
import type { IAccountSpreadsheet } from '../domain/ports';

const SHEET_NAME = 'Danh sách';

const HEADERS: Record<ImportKind, readonly [string, string, string]> = {
  STUDENT: ['MSSV', 'Họ tên', 'Email'],
  TEACHER: ['Mã GV', 'Họ tên', 'Email'],
};

/** Tên cột chấp nhận (đã chuẩn hóa: bỏ dấu, chữ thường, bỏ ký tự không phải chữ/số). */
const ACCEPTED_CODE_HEADERS: Record<ImportKind, readonly string[]> = {
  STUDENT: ['mssv', 'masosinhvien', 'masv'],
  TEACHER: ['magv', 'magiangvien', 'teachercode'],
};
const ACCEPTED_NAME_HEADERS = ['hoten', 'hovaten', 'ten', 'fullname'];
const ACCEPTED_EMAIL_HEADERS = ['email', 'mail'];

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // .xlsx là một tệp zip

const normalizeHeader = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * Đọc/ghi .xlsx bằng exceljs. Chỉ đọc sheet đầu tiên, chỉ lấy văn bản của ô (không chạy công thức, bỏ qua định dạng).
 * Giới hạn dung lượng và số dòng do use-case áp dụng (cấu hình); lớp này chỉ kiểm chữ ký tệp và tiêu đề.
 */
@Injectable()
export class ExcelJsAccountSpreadsheet implements IAccountSpreadsheet {
  async read(buffer: Buffer, kind: ImportKind): Promise<RawImportRow[]> {
    if (
      buffer.length < ZIP_SIGNATURE.length ||
      !ZIP_SIGNATURE.every((byte, i) => buffer[i] === byte)
    ) {
      throw new ImportFileError('File không phải định dạng .xlsx.');
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new ImportFileError(
        'Không đọc được file .xlsx (file hỏng hoặc không hợp lệ).',
      );
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new ImportFileError('File .xlsx không có sheet nào.');

    const header = sheet.getRow(1);
    const [h1, h2, h3] = [1, 2, 3].map((i) =>
      normalizeHeader(cellText(header, i)),
    );
    const okCode = ACCEPTED_CODE_HEADERS[kind].includes(h1);
    if (
      !okCode ||
      !ACCEPTED_NAME_HEADERS.includes(h2) ||
      !ACCEPTED_EMAIL_HEADERS.includes(h3)
    ) {
      const expected = HEADERS[kind].join(', ');
      throw new ImportFileError(
        `Sai tiêu đề cột. Dòng đầu phải là: ${expected} (dùng file mẫu).`,
      );
    }

    const rows: RawImportRow[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const code = cellText(row, 1);
      const fullName = cellText(row, 2);
      const email = cellText(row, 3);
      if (!code && !fullName && !email) return; // dòng trống hoàn toàn
      rows.push({ row: rowNumber, code, fullName, email });
    });
    return rows;
  }

  async buildTemplate(kind: ImportKind): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(SHEET_NAME);
    sheet.addRow([...HEADERS[kind]]);
    sheet.getRow(1).font = { bold: true };
    sheet.columns = [{ width: 18 }, { width: 32 }, { width: 38 }];

    const guide = workbook.addWorksheet('Hướng dẫn');
    guide.addRow([
      'Điền mỗi tài khoản một dòng, bắt đầu từ dòng 2 của sheet "Danh sách"; không đổi tên cột ở dòng 1.',
    ]);
    guide.addRow([
      kind === 'STUDENT'
        ? 'MSSV, Họ tên và Email đều bắt buộc; MSSV và Email không được trùng.'
        : 'Mã GV, Họ tên và Email đều bắt buộc; Mã GV và Email không được trùng.',
    ]);
    guide.addRow(['Chỉ tạo tài khoản mới; tài khoản đã có sẽ bị bỏ qua.']);
    guide.getColumn(1).width = 100;

    const data = await workbook.xlsx.writeBuffer();
    return Buffer.from(data);
  }
}

function cellText(row: ExcelJS.Row, index: number): string {
  const text = row.getCell(index).text;
  return typeof text === 'string' ? text.trim() : String(text ?? '').trim();
}
