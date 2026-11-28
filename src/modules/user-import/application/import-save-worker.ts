import { Inject, Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import type { IUserRepository } from '../../auth/domain/repositories/user.repository.interface';
import type { AccountProfile } from '../../auth/domain/repositories/account.types';
import { DuplicateAccountError } from '../../auth/domain/errors/duplicate-account.error';
import { UserEntity } from '../../auth/domain/entities/user.entity';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { AuthProviderType } from '../../auth/domain/enums/auth-provider-type.enum';
import {
  MAIL_QUEUE,
  type IMailQueue,
} from '../../mail/domain/ports/mail-queue.port';
import {
  TEMPORARY_PASSWORD_GENERATOR,
  type ITemporaryPasswordGenerator,
} from '../../user-admin/application/ports/temporary-password-generator.port';
import type {
  ExistingRow,
  ImportJob,
  ImportKind,
  ImportRow,
} from '../domain/import.types';
import {
  IMPORT_GRID_STORE,
  IMPORT_JOB_STORE,
  type IImportGridStore,
  type IImportJobStore,
} from '../domain/ports';
import { IMPORT_CONFIG, type ImportConfig } from './import-config';
import { mapWithConcurrency } from './map-with-concurrency';

/** Ghi tiến độ vào Redis sau mỗi chừng này tài khoản đã băm xong. */
const PROGRESS_STEP = 25;

/**
 * Tác vụ nền của nút Lưu (UCADM08 L1, BR-04, BR-05), tất cả hoặc không có gì:
 * kiểm trùng lại → sinh và băm mật khẩu tạm song song → MỘT transaction → xóa lưới → xếp hàng email.
 * Mật khẩu tạm chỉ ở bộ nhớ (không Redis, không log). Email chỉ xếp hàng SAU khi ghi DB thành công.
 * Mọi kết quả (kể cả lỗi) ghi vào trạng thái job; hàm không bao giờ ném lỗi ra ngoài.
 */
@Injectable()
export class ImportSaveWorker {
  private readonly logger = new Logger(ImportSaveWorker.name);

  constructor(
    @Inject('IUserRepository')
    private readonly userRepository: IUserRepository,
    @Inject(IMPORT_JOB_STORE) private readonly jobs: IImportJobStore,
    @Inject(IMPORT_GRID_STORE) private readonly grid: IImportGridStore,
    @Inject(TEMPORARY_PASSWORD_GENERATOR)
    private readonly passwordGenerator: ITemporaryPasswordGenerator,
    @Inject(MAIL_QUEUE) private readonly mailQueue: IMailQueue,
    @Inject(IMPORT_CONFIG) private readonly config: ImportConfig,
  ) {}

  async run(
    adminId: string,
    kind: ImportKind,
    rows: ImportRow[],
    startedAt: string,
  ): Promise<void> {
    const base: ImportJob = {
      status: 'PROCESSING',
      total: rows.length,
      processed: 0,
      startedAt,
    };
    try {
      const conflicts = await this.findConflicts(kind, rows);
      if (conflicts.length > 0) {
        await this.fail(adminId, kind, base, 'CONFLICT', conflicts);
        return;
      }

      let processed = 0;
      const prepared = await mapWithConcurrency(
        rows,
        this.config.hashConcurrency,
        async (row) => {
          const tempPassword = this.passwordGenerator.generate();
          const passwordHash = await argon2.hash(tempPassword);
          processed++;
          if (processed % PROGRESS_STEP === 0 && processed < rows.length) {
            await this.jobs.set(adminId, kind, { ...base, processed });
          }
          return { row, tempPassword, passwordHash };
        },
      );

      const items = prepared.map(({ row, passwordHash }) => ({
        user: new UserEntity(
          randomUUID(),
          row.email,
          row.fullName,
          kind === 'STUDENT' ? UserRole.STUDENT : UserRole.TEACHER,
          passwordHash,
          AuthProviderType.LOCAL,
          null,
          true, // mustChangePassword (BR-05)
          true,
          null,
        ),
        profile: (kind === 'STUDENT'
          ? { kind, studentCode: row.code }
          : { kind, teacherCode: row.code }) as AccountProfile,
      }));

      try {
        await this.userRepository.createAccounts(items);
      } catch (error) {
        if (error instanceof DuplicateAccountError) {
          // Có người vừa tạo trùng giữa lúc Lưu: không tạo gì, giữ lưới để Admin bỏ dòng trùng.
          const now = await this.findConflicts(kind, rows);
          await this.fail(adminId, kind, base, 'CONFLICT', now);
          return;
        }
        throw error;
      }

      await this.grid.clear(adminId, kind);
      // Email chỉ xếp hàng sau khi ghi DB thành công; gửi lỗi không rollback (BR-05).
      const queued = this.mailQueue.enqueueTemporaryPasswords(
        prepared.map(({ row, tempPassword }) => ({
          email: row.email,
          fullName: row.fullName,
          tempPassword,
          studentCode: kind === 'STUDENT' ? row.code : undefined,
        })),
      );
      await this.jobs.set(adminId, kind, {
        ...base,
        status: 'DONE',
        processed: rows.length,
        created: items.length,
        queued,
        finishedAt: new Date().toISOString(),
      });
    } catch {
      this.logger.error('Lưu import tài khoản thất bại.');
      await this.fail(adminId, kind, base, 'UNKNOWN').catch(() => undefined);
    } finally {
      await this.jobs.release(adminId, kind).catch(() => undefined);
    }
  }

  /** Dòng của lưới có email/mã trùng tài khoản đã có (vị trí `row` = thứ tự trong lưới, bắt đầu từ 1). */
  private async findConflicts(
    kind: ImportKind,
    rows: ImportRow[],
  ): Promise<ExistingRow[]> {
    const [emails, codes] = await Promise.all([
      this.userRepository.findTakenEmails(rows.map((r) => r.email)),
      this.userRepository.findTakenCodes(
        kind,
        rows.map((r) => r.code),
      ),
    ]);
    const conflicts: ExistingRow[] = [];
    rows.forEach((r, index) => {
      if (emails.has(r.email)) {
        conflicts.push({ row: index + 1, field: 'email', value: r.email });
      } else if (codes.has(r.code)) {
        conflicts.push({ row: index + 1, field: 'code', value: r.code });
      }
    });
    return conflicts;
  }

  private async fail(
    adminId: string,
    kind: ImportKind,
    base: ImportJob,
    code: 'CONFLICT' | 'UNKNOWN',
    conflicts?: ExistingRow[],
  ): Promise<void> {
    await this.jobs.set(adminId, kind, {
      ...base,
      status: 'FAILED',
      finishedAt: new Date().toISOString(),
      error: {
        code,
        message:
          code === 'CONFLICT'
            ? 'Có tài khoản đã tồn tại. Hãy xóa các dòng trùng khỏi bảng rồi Lưu lại; chưa có tài khoản nào được tạo.'
            : 'Không lưu được. Chưa có tài khoản nào được tạo; vui lòng thử lại.',
        ...(conflicts && conflicts.length > 0 ? { conflicts } : {}),
      },
    });
  }
}
