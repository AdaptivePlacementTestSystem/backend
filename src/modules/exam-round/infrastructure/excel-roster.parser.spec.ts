import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import { ExcelRosterParser } from './excel-roster.parser';

async function workbook(rows: unknown[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Danh sách');
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}
function parser(overrides: Record<string, number> = {}) {
  return new ExcelRosterParser({
    get: (key: string) => overrides[key],
  } as unknown as ConfigService);
}

describe('ExcelRosterParser', () => {
  it('file mẫu chỉ có tiêu đề và có thể đọc lại', async () => {
    const buffer = await parser().template();
    expect(await parser().read({ buffer, originalname: 'mau.xlsx' })).toEqual(
      [],
    );
  });
  it('đọc MSSV, ghi chú, giữ số dòng và báo lỗi công thức/thiếu MSSV', async () => {
    const data = await workbook([
      ['MSSV', 'Ghi chú'],
      [' 20110001 ', ' Ghi chú '],
      [null, null],
      [{ formula: '1+1', result: 2 }, ''],
      [null, 'cần mã'],
    ]);
    expect(
      await parser().read({ buffer: data, originalname: 'roster.xlsx' }),
    ).toEqual([
      { row: 2, studentCode: '20110001', note: 'Ghi chú' },
      {
        row: 4,
        studentCode: '2',
        note: '',
        error: 'Không chấp nhận ô công thức',
      },
      { row: 5, studentCode: '', note: 'cần mã', error: 'Thiếu MSSV' },
    ]);
  });
  it('báo lỗi ghi chú dài, không bỏ qua dòng lỗi', async () => {
    const data = await workbook([['MSSV'], ['SV01', 'a'.repeat(256)]]);
    expect(
      (await parser().read({ buffer: data, originalname: 'a.xlsx' }))[0].error,
    ).toBe('Ghi chú quá dài');
  });
  it('từ chối đuôi, chữ ký và tiêu đề sai', async () => {
    const data = await workbook([['Sai', 'Ghi chú'], ['SV01']]);
    await expect(
      parser().read({ buffer: data, originalname: 'a.xlsx' }),
    ).rejects.toThrow();
    await expect(
      parser().read({ buffer: data, originalname: 'a.xlsm' }),
    ).rejects.toThrow();
    await expect(
      parser().read({ buffer: Buffer.from('test'), originalname: 'a.xlsx' }),
    ).rejects.toThrow();
  });
  it('từ chối công thức trong tiêu đề và báo kiểu ô không hợp lệ', async () => {
    const formulaHeader = await workbook([
      [{ formula: '"MSSV"', result: 'MSSV' }],
      ['SV01'],
    ]);
    await expect(
      parser().read({ buffer: formulaHeader, originalname: 'a.xlsx' }),
    ).rejects.toThrow();
    const data = await workbook([['MSSV'], [true], [1.5]]);
    const rows = await parser().read({ buffer: data, originalname: 'a.xlsx' });
    expect(rows.map((row) => row.error)).toEqual([
      'Kiểu dữ liệu ô không hợp lệ',
      'Kiểu dữ liệu ô không hợp lệ',
    ]);
  });
  it('từ chối vượt giới hạn file nén, số dòng và kích thước giải nén', async () => {
    const data = await workbook([['MSSV'], ['SV01'], ['SV02']]);
    await expect(
      parser({ 'accountImport.maxFileBytes': data.length - 1 }).read({
        buffer: data,
        originalname: 'a.xlsx',
      }),
    ).rejects.toThrow();
    await expect(
      parser({ 'accountImport.maxRows': 1 }).read({
        buffer: data,
        originalname: 'a.xlsx',
      }),
    ).rejects.toThrow();
    await expect(
      parser({ 'accountImport.maxUncompressedBytes': 1024 }).read({
        buffer: data,
        originalname: 'a.xlsx',
      }),
    ).rejects.toThrow();
  });
});
