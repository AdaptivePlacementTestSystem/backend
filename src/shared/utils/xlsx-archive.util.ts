import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import * as yauzl from 'yauzl';

/** Kiểm kích thước giải nén thật trước khi ExcelJS nạp workbook vào bộ nhớ. */
export async function validateXlsxArchive(
  buffer: Buffer,
  limit: number,
): Promise<void> {
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
