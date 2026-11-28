import * as ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { ParseQuestionSpreadsheetUseCase } from './parse-question-spreadsheet.use-case';
import { SaveQuestionImportUseCase } from './save-question-import.use-case';
async function workbook(rows: unknown[][], header?: unknown[]) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Questions');
  sheet.addRow(
    header ?? [
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
    ],
  );
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
  it('tạo mẫu Excel đúng tiêu đề và không chứa câu hỏi', async () => {
    const parser = new ParseQuestionSpreadsheetUseCase();
    const buffer = await parser.template();
    const result = await parser.execute({
      buffer,
      size: buffer.length,
      originalname: 'template.xlsx',
    });
    expect(result).toEqual({ rows: [], rejected: [] });
  });
  it('rejects archives that expand beyond the size limit', async () => {
    const zip = new JSZip();
    zip.file('xl/large.xml', 'x'.repeat(20 * 1024 * 1024 + 1));
    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
    expect(buffer.length).toBeLessThan(2 * 1024 * 1024);
    await expect(
      new ParseQuestionSpreadsheetUseCase().execute({
        buffer,
        size: buffer.length,
        originalname: 'test.xlsx',
      }),
    ).rejects.toThrow();
  }, 15_000);
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
  it('từ chối sai tiêu đề và không dùng kết quả tính sẵn của công thức', async () => {
    const parser = new ParseQuestionSpreadsheetUseCase();
    await expect(
      parser.execute(await workbook([valid], ['wrong'])),
    ).rejects.toThrow();
    const row = [...valid];
    row[2] = { formula: '"travel"', result: 'travel' } as never;
    const result = await parser.execute(await workbook([row]));
    expect(result.rows).toHaveLength(0);
    expect(result.rejected[0].reasons).toContain('UNSUPPORTED_CELL_VALUE');
  });
  it('chấp nhận tiêu đề tiếng Việt được hướng dẫn trên giao diện', async () => {
    const result = await new ParseQuestionSpreadsheetUseCase().execute(
      await workbook(
        [valid],
        [
          'Skill',
          'CEFR',
          'Topic',
          'Câu hỏi',
          'A',
          'B',
          'C',
          'D',
          'Đáp án',
          'Giải thích',
          'Độ khó',
        ],
      ),
    );
    expect(result.rows).toHaveLength(1);
  });
  it('từ chối kích thước file khai báo không khớp nội dung', async () => {
    const file = await workbook([valid]);
    await expect(
      new ParseQuestionSpreadsheetUseCase().execute({ ...file, size: 0 }),
    ).rejects.toThrow();
  });
  it('lưu câu hỏi và tạo job C2 trong cùng transaction', async () => {
    const parsed = await new ParseQuestionSpreadsheetUseCase().execute(
      await workbook([valid]),
    );
    const tx = {
      itemBatch: { create: vi.fn().mockResolvedValue({ id: 'batch' }) },
      item: { createMany: vi.fn() },
      explanation: { createMany: vi.fn() },
      itemBatchJob: { create: vi.fn() },
    };
    const prisma = {
      itemBatch: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const result = await new SaveQuestionImportUseCase(prisma as never).execute(
      'admin',
      {
        operationId: 'operation',
        rows: parsed.rows.map((x) => x.candidate),
      },
    );
    expect(result.status).toBe('CHECKING');
    expect(tx.item.createMany).toHaveBeenCalledOnce();
    expect(tx.itemBatchJob.create).toHaveBeenCalledOnce();
  });
  it('từ chối dữ liệu bị sửa không hợp lệ khi lưu', async () => {
    const service = new SaveQuestionImportUseCase({
      itemBatch: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as never);
    await expect(
      service.execute('admin', {
        operationId: 'operation',
        rows: [{} as never],
      }),
    ).rejects.toThrow();
  });
});
