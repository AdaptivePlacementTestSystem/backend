import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import { validateXlsxArchive } from '../../../shared/utils/xlsx-archive.util';

export interface RosterSpreadsheetRow {
  row: number;
  studentCode: string;
  note: string;
  error?: string;
}

function normalizeHeader(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

@Injectable()
export class ExcelRosterParser {
  constructor(private readonly config: ConfigService) {}

  async template(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Danh sách');
    sheet.addRow(['MSSV', 'Ghi chú']);
    sheet.getRow(1).font = { bold: true };
    sheet.columns = [{ width: 24 }, { width: 45 }];
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async read(file: {
    buffer: Buffer;
    originalname: string;
  }): Promise<RosterSpreadsheetRow[]> {
    const maxBytes =
      this.config.get<number>('accountImport.maxFileBytes') ?? 2097152;
    const maxRows = this.config.get<number>('accountImport.maxRows') ?? 1000;
    const maxUncompressed =
      this.config.get<number>('accountImport.maxUncompressedBytes') ?? 20971520;
    const buffer = file.buffer;
    if (
      !/\.xlsx$/i.test(file.originalname) ||
      buffer.length < 4 ||
      !buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    ) {
      throw new BadRequestException('Chỉ chấp nhận file .xlsx hợp lệ');
    }
    if (buffer.length > maxBytes)
      throw new PayloadTooLargeException('File vượt giới hạn dung lượng');
    await validateXlsxArchive(buffer, maxUncompressed);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException('Không đọc được file .xlsx');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('File không có sheet');
    const header = sheet.getRow(1);
    const a = normalizeHeader(header.getCell(1).text);
    const b = normalizeHeader(header.getCell(2).text);
    if (
      [header.getCell(1), header.getCell(2)].some(
        (cell) => cell.type === ExcelJS.ValueType.Formula,
      ) ||
      !['mssv', 'masosinhvien', 'masv'].includes(a) ||
      (b && !['ghichu', 'note'].includes(b))
    ) {
      throw new BadRequestException(
        'Tiêu đề phải là MSSV và Ghi chú (tùy chọn)',
      );
    }
    if (sheet.rowCount > maxRows + 1)
      throw new BadRequestException('File vượt số dòng cho phép');
    const rows: RosterSpreadsheetRow[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const aCell = row.getCell(1);
      const bCell = row.getCell(2);
      const formula = [aCell, bCell].some(
        (cell) => cell.type === ExcelJS.ValueType.Formula,
      );
      const unsupported = [aCell, bCell].some(
        (cell) =>
          ![
            ExcelJS.ValueType.Null,
            ExcelJS.ValueType.String,
            ExcelJS.ValueType.Number,
            ExcelJS.ValueType.Formula,
          ].includes(cell.type),
      );
      const unsafeNumber =
        typeof aCell.value === 'number' && !Number.isSafeInteger(aCell.value);
      const studentCode = aCell.text.trim();
      const note = bCell.text.trim();
      if (!studentCode && !note && !formula) return;
      const error = formula
        ? 'Không chấp nhận ô công thức'
        : unsupported || unsafeNumber
          ? 'Kiểu dữ liệu ô không hợp lệ'
          : !studentCode
            ? 'Thiếu MSSV'
            : studentCode.length > 50
              ? 'MSSV quá dài'
              : note.length > 255
                ? 'Ghi chú quá dài'
                : undefined;
      rows.push({
        row: rowNumber,
        studentCode,
        note,
        ...(error ? { error } : {}),
      });
    });
    return rows;
  }
}
