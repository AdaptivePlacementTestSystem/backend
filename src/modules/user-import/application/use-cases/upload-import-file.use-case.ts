import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { isEmail } from 'class-validator';
import type { IUserRepository } from '../../../auth/domain/repositories/user.repository.interface';
import { ImportFileError } from '../../domain/import-file.error';
import type {
  ExistingRow,
  ImportKind,
  ImportRow,
  RawImportRow,
  RejectedRow,
  UploadResult,
} from '../../domain/import.types';
import {
  ACCOUNT_SPREADSHEET,
  IMPORT_GRID_STORE,
  type IAccountSpreadsheet,
  type IImportGridStore,
} from '../../domain/ports';
import { IMPORT_CONFIG, type ImportConfig } from '../import-config';
import { importFileInvalid } from '../import-errors';

export interface UploadedFile {
  buffer: Buffer;
  size: number;
  originalname: string;
}

export interface UploadImportInput {
  adminId: string;
  kind: ImportKind;
  file: UploadedFile | undefined;
}

/**
 * UCADM08, luồng L1: đọc một file .xlsx, kiểm từng dòng theo BR-03 rồi GỘP vào lưới tạm (Redis).
 * - Dòng thiếu cột / email sai / trùng trong file → `rejected` (loại, báo popup).
 * - Dòng đã có trong lưới (tải thêm file trùng) → bỏ qua, đếm `ignoredDuplicates`.
 * - Dòng trùng tài khoản đã có trong hệ thống → `existing` (popup riêng), không vào lưới.
 * Chỉ tạo mới; không cập nhật tài khoản có sẵn. Chưa ghi gì vào DB.
 */
@Injectable()
export class UploadImportFileUseCase {
  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
    @Inject(IMPORT_GRID_STORE) private readonly grid: IImportGridStore,
    @Inject(ACCOUNT_SPREADSHEET) private readonly sheet: IAccountSpreadsheet,
    @Inject(IMPORT_CONFIG) private readonly config: ImportConfig,
  ) {}

  async execute(input: UploadImportInput): Promise<UploadResult> {
    const { adminId, kind, file } = input;
    if (!file) throw importFileInvalid('Chưa chọn file .xlsx.');
    if (file.size > this.config.maxFileBytes) {
      throw importFileInvalid(
        `File vượt quá ${Math.round(this.config.maxFileBytes / 1024 / 1024)} MB.`,
        413,
      );
    }

    let raw: RawImportRow[];
    try {
      raw = await this.sheet.read(file.buffer, kind);
    } catch (error) {
      if (error instanceof ImportFileError) {
        throw importFileInvalid(error.message, error.status);
      }
      throw error;
    }
    if (raw.length > this.config.maxRows) {
      throw importFileInvalid(
        `File có ${raw.length} dòng, vượt giới hạn ${this.config.maxRows} dòng.`,
      );
    }

    const currentGrid = (await this.grid.load(adminId, kind)) ?? [];
    const gridEmails = new Set(currentGrid.map((r) => r.email));
    const gridCodes = new Set(currentGrid.map((r) => r.code));

    const rejected: RejectedRow[] = [];
    const candidates: RawImportRow[] = [];
    const seenEmails = new Set<string>();
    const seenCodes = new Set<string>();
    let ignoredDuplicates = 0;

    for (const row of raw) {
      const email = row.email.toLowerCase();
      if (!row.code || !row.fullName || !email) {
        rejected.push({
          row: row.row,
          code: 'MISSING_FIELD',
          reason: 'Thiếu mã, họ tên hoặc email.',
        });
      } else if (!isEmail(email)) {
        rejected.push({
          row: row.row,
          code: 'INVALID_EMAIL',
          reason: 'Email không đúng định dạng.',
        });
      } else if (seenEmails.has(email) || seenCodes.has(row.code)) {
        rejected.push({
          row: row.row,
          code: 'DUPLICATE_IN_FILE',
          reason: 'Trùng email hoặc mã với một dòng trước trong file.',
        });
      } else {
        seenEmails.add(email);
        seenCodes.add(row.code);
        if (gridEmails.has(email) || gridCodes.has(row.code)) {
          ignoredDuplicates++; // đã có trong lưới: bỏ qua, không báo lỗi
        } else {
          candidates.push({ ...row, email });
        }
      }
    }

    const [takenEmails, takenCodes] = await Promise.all([
      this.userRepository.findTakenEmails(candidates.map((c) => c.email)),
      this.userRepository.findTakenCodes(
        kind,
        candidates.map((c) => c.code),
      ),
    ]);

    const existing: ExistingRow[] = [];
    const added: ImportRow[] = [];
    for (const c of candidates) {
      if (takenEmails.has(c.email)) {
        existing.push({ row: c.row, field: 'email', value: c.email });
      } else if (takenCodes.has(c.code)) {
        existing.push({ row: c.row, field: 'code', value: c.code });
      } else {
        added.push({
          rowKey: randomUUID(),
          code: c.code,
          fullName: c.fullName,
          email: c.email,
        });
      }
    }

    if (currentGrid.length + added.length > this.config.maxRows) {
      throw importFileInvalid(
        `Bảng import sẽ vượt ${this.config.maxRows} dòng. Hãy lưu hoặc xóa bớt dòng trước khi tải thêm file.`,
      );
    }

    const grid = [...currentGrid, ...added];
    await this.grid.store(adminId, kind, grid); // luôn làm mới TTL, kể cả khi không có dòng mới
    return {
      grid,
      rejected,
      existing,
      added: added.length,
      ignoredDuplicates,
    };
  }
}
