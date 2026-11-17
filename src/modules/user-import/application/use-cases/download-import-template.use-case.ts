import { Inject, Injectable } from '@nestjs/common';
import type { ImportKind } from '../../domain/import.types';
import {
  ACCOUNT_SPREADSHEET,
  type IAccountSpreadsheet,
} from '../../domain/ports';

/** File mẫu (hai loại: SV và GV) sinh từ cùng nguồn với bộ đọc file nên tên cột không thể lệch nhau. */
@Injectable()
export class DownloadImportTemplateUseCase {
  constructor(
    @Inject(ACCOUNT_SPREADSHEET) private readonly sheet: IAccountSpreadsheet,
  ) {}

  async execute(
    kind: ImportKind,
  ): Promise<{ buffer: Buffer; filename: string }> {
    return {
      buffer: await this.sheet.buildTemplate(kind),
      filename:
        kind === 'STUDENT' ? 'import-sinh-vien.xlsx' : 'import-giang-vien.xlsx',
    };
  }
}
