import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ErrorCode } from '@apt/shared-types';
import { ImportSaveWorker } from './import-save-worker';
import {
  GetImportSaveStatusUseCase,
  SaveImportUseCase,
} from './use-cases/save-import.use-case';
import { mapWithConcurrency } from './map-with-concurrency';
import { DuplicateAccountError } from '../../auth/domain/errors/duplicate-account.error';
import type { UserEntity } from '../../auth/domain/entities/user.entity';
import type { AccountProfile } from '../../auth/domain/repositories/account.types';
import { FakeGridStore, FakeJobStore } from '../testing/fakes';
import type { ImportRow } from '../domain/import.types';

const ADMIN = 'admin-1';
const row = (n: number): ImportRow => ({
  rowKey: `k${n}`,
  code: `C${n}`,
  fullName: `Người ${n}`,
  email: `u${n}@e.com`,
});

let counter = 0;
const generator = { generate: () => `Tmp#Pass-${++counter}x` };

describe('Lưu import tài khoản (nền, tất cả hoặc không có gì)', () => {
  let grid: FakeGridStore;
  let jobs: FakeJobStore;
  let users: any;
  let mailQueue: any;
  let worker: ImportSaveWorker;
  let save: SaveImportUseCase;
  const config = { maxFileBytes: 2097152, maxRows: 1000, hashConcurrency: 4 };

  beforeEach(() => {
    counter = 0;
    grid = new FakeGridStore();
    jobs = new FakeJobStore();
    users = {
      findTakenEmails: vi.fn().mockResolvedValue(new Set<string>()),
      findTakenCodes: vi.fn().mockResolvedValue(new Set<string>()),
      createAccounts: vi.fn().mockResolvedValue(undefined),
    };
    mailQueue = {
      enqueueTemporaryPasswords: vi.fn((items: unknown[]) => items.length),
    };
    worker = new ImportSaveWorker(
      users,
      jobs,
      grid,
      generator,
      mailQueue,
      config,
    );
    save = new SaveImportUseCase(grid, jobs, worker);
  });

  /** Chờ tác vụ nền xong (job rời PROCESSING và khóa được nhả). */
  const settle = async (kind: 'STUDENT' | 'TEACHER' = 'STUDENT') => {
    for (let i = 0; i < 400; i++) {
      const job = await jobs.get(ADMIN, kind);
      if (job && job.status !== 'PROCESSING' && jobs.locks.size === 0)
        return job;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('tác vụ nền không kết thúc');
  };

  describe('nút Lưu (kiểm tra trước khi chạy nền)', () => {
    it('lưới hết hạn (không còn khóa Redis): 410 IMPORT_GRID_EXPIRED', async () => {
      const error: any = await save.execute(ADMIN, 'STUDENT').catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(410);
      expect(error.getResponse()).toMatchObject({
        code: ErrorCode.IMPORT_GRID_EXPIRED,
      });
    });

    it('lưới rỗng (còn khóa nhưng hết dòng): 422 IMPORT_GRID_EMPTY', async () => {
      await grid.store(ADMIN, 'STUDENT', []);

      const error: any = await save.execute(ADMIN, 'STUDENT').catch((e) => e);

      expect(error.getStatus()).toBe(422);
      expect(error.getResponse()).toMatchObject({
        code: ErrorCode.IMPORT_GRID_EMPTY,
      });
    });

    it('trả ngay {total} và chạy nền; job ở trạng thái PROCESSING', async () => {
      await grid.store(ADMIN, 'STUDENT', [row(1), row(2)]);

      const result = await save.execute(ADMIN, 'STUDENT');

      expect(result).toEqual({ total: 2 });
      expect(jobs.history[0]).toMatchObject({
        status: 'PROCESSING',
        total: 2,
        processed: 0,
      });
      await settle();
    });

    it('đang có tác vụ Lưu cho cùng (admin, loại): 409, không chạy hai lần', async () => {
      await grid.store(ADMIN, 'STUDENT', [row(1)]);
      jobs.locks.add(`${ADMIN}:STUDENT`);

      const error: any = await save.execute(ADMIN, 'STUDENT').catch((e) => e);

      expect(error.getStatus()).toBe(409);
      expect(users.createAccounts).not.toHaveBeenCalled();
    });

    it('loại khác hoặc Admin khác không bị chặn bởi khóa này', async () => {
      await grid.store(ADMIN, 'TEACHER', [row(1)]);
      jobs.locks.add(`${ADMIN}:STUDENT`);

      await expect(save.execute(ADMIN, 'TEACHER')).resolves.toEqual({
        total: 1,
      });
      jobs.locks.delete(`${ADMIN}:STUDENT`); // khóa giả lập của loại khác, không phải của tác vụ này
      await settle('TEACHER');
    });
  });

  describe('tác vụ nền: thành công', () => {
    it('tạo sinh viên: role STUDENT, LOCAL, mustChangePassword, hồ sơ MSSV, mật khẩu băm argon2', async () => {
      await grid.store(ADMIN, 'STUDENT', [row(1), row(2), row(3)]);

      await save.execute(ADMIN, 'STUDENT');
      const job = await settle();

      expect(job).toMatchObject({
        status: 'DONE',
        total: 3,
        created: 3,
        queued: 3,
        processed: 3,
      });
      const items = users.createAccounts.mock.calls[0][0] as Array<{
        user: UserEntity;
        profile: AccountProfile;
      }>;
      expect(items).toHaveLength(3);
      expect(items[0].user).toMatchObject({
        email: 'u1@e.com',
        fullName: 'Người 1',
        role: 'STUDENT',
        authProvider: 'LOCAL',
        mustChangePassword: true,
        isActive: true,
      });
      expect(items[0].profile).toEqual({ kind: 'STUDENT', studentCode: 'C1' });
      expect(
        await argon2.verify(items[0].user.passwordHash!, 'Tmp#Pass-1x'),
      ).toBe(true);
      expect(new Set(items.map((i) => i.user.id)).size).toBe(3); // id khác nhau
    });

    it('tạo giảng viên: role TEACHER và hồ sơ mã GV', async () => {
      await grid.store(ADMIN, 'TEACHER', [row(1)]);

      await save.execute(ADMIN, 'TEACHER');
      await settle('TEACHER');

      const [item] = users.createAccounts.mock.calls[0][0];
      expect(item.user.role).toBe('TEACHER');
      expect(item.profile).toEqual({ kind: 'TEACHER', teacherCode: 'C1' });
    });

    it('MỘT lần gọi createAccounts duy nhất cho cả lô (một transaction)', async () => {
      await grid.store(
        ADMIN,
        'STUDENT',
        Array.from({ length: 30 }, (_, i) => row(i + 1)),
      );

      await save.execute(ADMIN, 'STUDENT');
      await settle();

      expect(users.createAccounts).toHaveBeenCalledTimes(1);
      expect(users.createAccounts.mock.calls[0][0]).toHaveLength(30);
    });

    it('sau khi ghi DB: xóa lưới, rồi mới xếp hàng email (đúng thứ tự)', async () => {
      await grid.store(ADMIN, 'STUDENT', [row(1), row(2)]);
      const order: string[] = [];
      users.createAccounts.mockImplementation(
        async () => void order.push('db'),
      );
      const clear = grid.clear.bind(grid);
      grid.clear = async (a, k) => {
        order.push('clear');
        return clear(a, k);
      };
      mailQueue.enqueueTemporaryPasswords.mockImplementation(
        (items: unknown[]) => {
          order.push('mail');
          return items.length;
        },
      );

      await save.execute(ADMIN, 'STUDENT');
      await settle();

      expect(order).toEqual(['db', 'clear', 'mail']);
      expect(await grid.load(ADMIN, 'STUDENT')).toBeNull();
    });

    it('thư xếp hàng: đúng người nhận, mật khẩu đúng với mã băm, MSSV chỉ cho SV', async () => {
      await grid.store(ADMIN, 'STUDENT', [row(1)]);

      await save.execute(ADMIN, 'STUDENT');
      await settle();

      const [mails] = mailQueue.enqueueTemporaryPasswords.mock.calls[0];
      expect(mails).toEqual([
        {
          email: 'u1@e.com',
          fullName: 'Người 1',
          tempPassword: 'Tmp#Pass-1x',
          studentCode: 'C1',
        },
      ]);
      const [[items]] = users.createAccounts.mock.calls;
      const item = items[0];
      expect(
        await argon2.verify(item.user.passwordHash, mails[0].tempPassword),
      ).toBe(true);
    });

    it('giảng viên: thư không kèm MSSV', async () => {
      await grid.store(ADMIN, 'TEACHER', [row(1)]);

      await save.execute(ADMIN, 'TEACHER');
      await settle('TEACHER');

      expect(
        mailQueue.enqueueTemporaryPasswords.mock.calls[0][0][0].studentCode,
      ).toBeUndefined();
    });

    it('mật khẩu tạm không lọt vào trạng thái job (Redis)', async () => {
      await grid.store(ADMIN, 'STUDENT', [row(1), row(2)]);

      await save.execute(ADMIN, 'STUDENT');
      await settle();

      const text = JSON.stringify(jobs.history);
      expect(text).not.toContain('Tmp#Pass');
      expect(text).not.toContain('argon2');
    });

    it('khóa tác vụ được nhả sau khi xong: có thể Lưu lô mới', async () => {
      await grid.store(ADMIN, 'STUDENT', [row(1)]);
      await save.execute(ADMIN, 'STUDENT');
      await settle();

      await grid.store(ADMIN, 'STUDENT', [row(2)]);
      await expect(save.execute(ADMIN, 'STUDENT')).resolves.toEqual({
        total: 1,
      });
      await settle();
    });

    it('ghi tiến độ khi lô lớn (processed tăng dần rồi bằng total)', async () => {
      await grid.store(
        ADMIN,
        'STUDENT',
        Array.from({ length: 60 }, (_, i) => row(i + 1)),
      );

      await save.execute(ADMIN, 'STUDENT');
      await settle();

      const processed = jobs.history
        .filter((j) => j.status === 'PROCESSING')
        .map((j) => j.processed);
      expect(Math.max(...processed)).toBeGreaterThanOrEqual(25);
      expect(jobs.history[jobs.history.length - 1]).toMatchObject({
        status: 'DONE',
        processed: 60,
      });
    });
  });

  describe('tác vụ nền: thất bại, không tạo gì', () => {
    it('có dòng trùng tài khoản vừa được tạo: FAILED CONFLICT kèm danh sách, không ghi DB, giữ lưới, không gửi mail', async () => {
      await grid.store(ADMIN, 'STUDENT', [row(1), row(2), row(3)]);
      users.findTakenEmails.mockResolvedValue(new Set(['u2@e.com']));

      await save.execute(ADMIN, 'STUDENT');
      const job = await settle();

      expect(job.status).toBe('FAILED');
      expect(job.error?.code).toBe('CONFLICT');
      expect(job.error?.conflicts).toEqual([
        { row: 2, field: 'email', value: 'u2@e.com' },
      ]);
      expect(users.createAccounts).not.toHaveBeenCalled();
      expect(mailQueue.enqueueTemporaryPasswords).not.toHaveBeenCalled();
      expect(await grid.load(ADMIN, 'STUDENT')).toHaveLength(3);
    });

    it('trùng mã sinh viên cũng được phát hiện', async () => {
      await grid.store(ADMIN, 'STUDENT', [row(1)]);
      users.findTakenCodes.mockResolvedValue(new Set(['C1']));

      await save.execute(ADMIN, 'STUDENT');
      const job = await settle();

      expect(job.error?.conflicts).toEqual([
        { row: 1, field: 'code', value: 'C1' },
      ]);
    });

    it('đua ghi: DB báo trùng khi tạo → FAILED CONFLICT, giữ lưới, không gửi mail', async () => {
      await grid.store(ADMIN, 'STUDENT', [row(1), row(2)]);
      users.createAccounts.mockRejectedValue(
        new DuplicateAccountError('email'),
      );

      await save.execute(ADMIN, 'STUDENT');
      const job = await settle();

      expect(job).toMatchObject({
        status: 'FAILED',
        error: { code: 'CONFLICT' },
      });
      expect(mailQueue.enqueueTemporaryPasswords).not.toHaveBeenCalled();
      expect(await grid.load(ADMIN, 'STUDENT')).toHaveLength(2);
    });

    it('lỗi bất ngờ: FAILED UNKNOWN, thông báo chung không lộ chi tiết, giữ lưới, nhả khóa', async () => {
      await grid.store(ADMIN, 'STUDENT', [row(1)]);
      users.createAccounts.mockRejectedValue(
        new Error('connection refused postgres://secret'),
      );

      await save.execute(ADMIN, 'STUDENT');
      const job = await settle();

      expect(job).toMatchObject({
        status: 'FAILED',
        error: { code: 'UNKNOWN' },
      });
      expect(JSON.stringify(job)).not.toContain('postgres://secret');
      expect(jobs.locks.size).toBe(0);
      expect(await grid.load(ADMIN, 'STUDENT')).toHaveLength(1);
    });

    it('sau khi FAILED có thể bấm Lưu lại', async () => {
      await grid.store(ADMIN, 'STUDENT', [row(1)]);
      users.createAccounts.mockRejectedValueOnce(new Error('x'));
      await save.execute(ADMIN, 'STUDENT');
      await settle();

      await expect(save.execute(ADMIN, 'STUDENT')).resolves.toEqual({
        total: 1,
      });
      const job = await settle();
      expect(job.status).toBe('DONE');
    });
  });

  describe('xem trạng thái', () => {
    it('chưa Lưu lần nào: NONE', async () => {
      const status = await new GetImportSaveStatusUseCase(jobs).execute(
        ADMIN,
        'STUDENT',
      );
      expect(status).toEqual({ status: 'NONE' });
    });

    it('trả trạng thái job của đúng (admin, loại)', async () => {
      await grid.store(ADMIN, 'STUDENT', [row(1)]);
      await save.execute(ADMIN, 'STUDENT');
      await settle();

      const get = new GetImportSaveStatusUseCase(jobs);
      expect((await get.execute(ADMIN, 'STUDENT')).status).toBe('DONE');
      expect((await get.execute(ADMIN, 'TEACHER')).status).toBe('NONE');
      expect((await get.execute('admin-2', 'STUDENT')).status).toBe('NONE');
    });
  });
});

describe('mapWithConcurrency', () => {
  it('giữ nguyên thứ tự kết quả và không vượt độ song song', async () => {
    let running = 0;
    let peak = 0;
    const result = await mapWithConcurrency(
      [1, 2, 3, 4, 5, 6, 7],
      3,
      async (n) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
        return n * 2;
      },
    );

    expect(result).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('mảng rỗng trả rỗng; một tác vụ lỗi thì ném lỗi đó', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('hỏng');
        return n;
      }),
    ).rejects.toThrow('hỏng');
  });
});
