import * as ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { ParseQuestionSpreadsheetUseCase } from './parse-question-spreadsheet.use-case';
import { SaveQuestionImportUseCase } from './save-question-import.use-case';
async function workbook(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Questions');
  sheet.addRow([
    'Skill',
    'CEFR',
    'Topic',
    'Question',
    'A',
    'B',
    'C',
    'D',
    'Answer',
    'Explanation',
    'IRT',
  ]);
  rows.forEach((row) => sheet.addRow(row));
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, size: buffer.length, originalname: 'questions.xlsx' };
}
const valid = [
  'GRAMMAR',
  'A2',
  'travel',
  'Where is it?',
  'here',
  'there',
  'far',
  'near',
  'A',
  'It is here',
  0,
];
describe('nhập câu hỏi Excel', () => {
  it('đọc câu hợp lệ, loại câu sai và trùng trong tệp', async () => {
    const input = await workbook([
      valid,
      valid,
      ['GRAMMAR', 'A2', '', 'bad', 'a', 'a', 'c', 'd', 'A', 'why', 0],
    ]);
    const result = await new ParseQuestionSpreadsheetUseCase().execute(input);
    expect(result.rows).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0].reasons).toContain('DUPLICATE_IN_FILE');
  });
  it('chỉ lưu sau khi admin xác nhận, rồi chạy kiểm tra C2 và lấy trạng thái từ kết quả', async () => {
    const parsed = await new ParseQuestionSpreadsheetUseCase().execute(
      await workbook([valid]),
    );
    const tx = {
      itemBatch: { create: vi.fn().mockResolvedValue({ id: 'batch' }) },
      item: { createMany: vi.fn() },
      explanation: { createMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const result = await new SaveQuestionImportUseCase(
      prisma as never,
      {
        execute: vi.fn().mockResolvedValue({
          status: 'READY_TO_ASSIGN',
          remaining: 1,
          exactRejected: 0,
          nearRejected: 0,
          nearFlagged: 0,
          semanticSkipped: 0,
          semanticFlagged: 0,
        }),
      } as never,
    ).execute('admin', { rows: parsed.rows.map((x) => x.candidate) });
    expect(result.status).toBe('READY_TO_ASSIGN');
    expect(result.exactDuplicates).toBe(0);
    expect(tx.item.createMany).toHaveBeenCalledOnce();
  });
  it('từ chối dữ liệu bị sửa không hợp lệ khi lưu', async () => {
    const service = new SaveQuestionImportUseCase({} as never, {} as never);
    await expect(
      service.execute('admin', { rows: [{} as never] }),
    ).rejects.toThrow();
  });
});
