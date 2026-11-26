import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { validateCandidate } from '../domain/candidate-validation';

export type ImportedCandidate = {
  content: string;
  options: Record<string, string>;
  correctAnswer: string;
  explanation: string;
  skill: string;
  cefrTarget: string;
  topicTag: string;
  irtB: number;
};
const MAX_ROWS = 1000;
@Injectable()
export class ParseQuestionSpreadsheetUseCase {
  async execute(
    file: { buffer: Buffer; originalname: string; size: number } | undefined,
  ) {
    if (
      !file ||
      !file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.size > 2 * 1024 * 1024
    )
      throw new BadRequestException('Chọn tệp .xlsx không quá 2 MB');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException('Không đọc được tệp Excel');
    }
    const sheet = wb.worksheets[0];
    if (!sheet || sheet.rowCount > MAX_ROWS + 1)
      throw new BadRequestException('Tệp trống hoặc vượt quá 1000 dòng');
    const text = (row: ExcelJS.Row, col: number) => {
      const cell = row.getCell(col);
      const v = cell.value;
      if (typeof v === 'string' || typeof v === 'number')
        return String(v).trim();
      return '';
    };
    const rows: Array<{ row: number; candidate: ImportedCandidate }> = [];
    const rejected: Array<{ row: number; reasons: string[] }> = [];
    const seen = new Set<string>();
    for (let n = 2; n <= sheet.rowCount; n++) {
      const row = sheet.getRow(n);
      if (!row.hasValues) continue;
      const irt = text(row, 11);
      const candidate: ImportedCandidate = {
        skill: text(row, 1).toUpperCase(),
        cefrTarget: text(row, 2).toUpperCase(),
        topicTag: text(row, 3),
        content: text(row, 4),
        options: {
          A: text(row, 5),
          B: text(row, 6),
          C: text(row, 7),
          D: text(row, 8),
        },
        correctAnswer: text(row, 9).toUpperCase(),
        explanation: text(row, 10),
        irtB: irt === '' ? 0 : Number(irt),
      };
      const reasons = validateCandidate(candidate);
      if (
        !Number.isFinite(candidate.irtB) ||
        candidate.irtB < -4 ||
        candidate.irtB > 4
      )
        reasons.push('IRT_B_INVALID');
      const key = candidate.content
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      if (key && seen.has(key)) reasons.push('DUPLICATE_IN_FILE');
      if (key) seen.add(key);
      if (reasons.length) rejected.push({ row: n, reasons });
      else rows.push({ row: n, candidate });
    }
    return { rows, rejected };
  }
}
