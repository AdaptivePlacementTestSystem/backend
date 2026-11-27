import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import * as yauzl from 'yauzl';
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
const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
async function validateArchive(buffer: Buffer, limit: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) {
          reject(new BadRequestException('File .xlsx không hợp lệ'));
          return;
        }
        let total = 0;
        let ended = false;
        const fail = (cause: Error) => {
          if (ended) return;
          ended = true;
          zip.close();
          reject(cause);
        };
        zip.on('error', () =>
          fail(new BadRequestException('File .xlsx không hợp lệ')),
        );
        zip.on('end', () => {
          if (!ended) {
            ended = true;
            resolve();
          }
        });
        zip.on('entry', (entry: yauzl.Entry) => {
          if (
            (entry.generalPurposeBitFlag & 1) !== 0 ||
            /(^|\/)vbaproject\.bin$/i.test(entry.fileName)
          ) {
            fail(
              new BadRequestException(
                'File mã hóa hoặc có macro không được hỗ trợ',
              ),
            );
            return;
          }
          if (entry.uncompressedSize > limit - total) {
            fail(new PayloadTooLargeException('File giải nén vượt giới hạn'));
            return;
          }
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) {
              fail(new BadRequestException('File .xlsx không hợp lệ'));
              return;
            }
            stream.on('data', (chunk: Buffer) => {
              total += chunk.length;
              if (total > limit) {
                stream.destroy();
                fail(
                  new PayloadTooLargeException('File giải nén vượt giới hạn'),
                );
              }
            });
            stream.on('error', () =>
              fail(new BadRequestException('File .xlsx không hợp lệ')),
            );
            stream.on('end', () => {
              if (!ended) zip.readEntry();
            });
          });
        });
        zip.readEntry();
      },
    );
  });
}

@Injectable()
export class ParseQuestionSpreadsheetUseCase {
  async template(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Questions');
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
    sheet.getRow(1).font = { bold: true };
    sheet.columns = [18, 12, 22, 48, 24, 24, 24, 24, 12, 48, 12].map(
      (width) => ({ width }),
    );
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  async execute(
    file: { buffer: Buffer; originalname: string; size: number } | undefined,
  ) {
    if (
      !file ||
      typeof file.originalname !== 'string' ||
      !file.originalname.toLowerCase().endsWith('.xlsx') ||
      !Buffer.isBuffer(file.buffer) ||
      file.size !== file.buffer.length ||
      file.buffer.length > 2 * 1024 * 1024
    )
      throw new BadRequestException('Chọn tệp .xlsx không quá 2 MB');
    await validateArchive(file.buffer, MAX_UNCOMPRESSED_BYTES);
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException('Không đọc được tệp Excel');
    }
    const sheet = wb.worksheets[0];
    if (!sheet || sheet.rowCount > MAX_ROWS + 1)
      throw new BadRequestException('Tệp trống hoặc vượt quá 1000 dòng');
    const headers = [
      ['skill'],
      ['cefr'],
      ['topic'],
      ['question', 'câu hỏi'],
      ['a'],
      ['b'],
      ['c'],
      ['d'],
      ['answer', 'đáp án'],
      ['explanation', 'giải thích'],
      ['irt', 'độ khó'],
    ];
    if (
      headers.some((expected, index) => {
        const value = sheet.getRow(1).getCell(index + 1).value;
        return (
          typeof value !== 'string' ||
          !expected.includes(value.trim().normalize('NFC').toLowerCase())
        );
      })
    )
      throw new BadRequestException('Tiêu đề tệp không đúng mẫu');
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
        Array.from(
          { length: headers.length },
          (_, index) => row.getCell(index + 1).value,
        ).some(
          (value) =>
            value !== null &&
            typeof value !== 'string' &&
            typeof value !== 'number',
        )
      )
        reasons.push('UNSUPPORTED_CELL_VALUE');
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
