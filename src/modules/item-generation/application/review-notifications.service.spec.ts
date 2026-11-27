import { describe, expect, it, vi } from 'vitest';
import {
  reviewReminderAt,
  ReviewNotificationsService,
} from './review-notifications.service';

describe('thời gian nhắc việc theo giờ Việt Nam', () => {
  it('nhắc lúc 08:00 ngày trước ngày hết hạn dù hạn không phải cuối ngày', () => {
    expect(
      reviewReminderAt(new Date('2026-11-26T08:30:00+07:00')).toISOString(),
    ).toBe('2026-11-25T01:00:00.000Z');
    expect(
      reviewReminderAt(new Date('2027-01-01T23:59:00+07:00')).toISOString(),
    ).toBe('2026-12-31T01:00:00.000Z');
  });
});

describe('email nhắc việc', () => {
  it('gộp thông báo giao việc và xác nhận gửi trong giao dịch', async () => {
    const row = {
      id: '1',
      status: 'DRAFT',
      reviewerId: 'a',
      firstAssignmentNoticeSent: false,
      secondAssignmentNoticeSent: false,
      reviewer: { email: 'a@example.test' },
      batch: { confirmer: { id: 'b', email: 'b@example.test' } },
      firstReview: { dueAt: '2026-11-26T10:00:00Z' },
      secondReview: { dueAt: '2026-11-27T10:00:00Z' },
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      item: { findMany: vi.fn().mockResolvedValue([row]) },
      reviewNoticeOutbox: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((fn: (tx: unknown) => unknown) =>
        fn({ item: { updateMany } }),
      ),
    };
    const mail = { sendMail: vi.fn().mockResolvedValue(true) };
    await new ReviewNotificationsService(
      prisma as never,
      mail as never,
    ).assigned('batch');
    expect(mail.sendMail).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      reviewerId: 'a', batch: { is: { status: 'IN_REVIEW' } },
    }) }));
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      batch: { is: { status: 'IN_REVIEW', confirmerId: 'b' } },
    }) }));
  });
  it('gộp câu cùng lô và GV vào một email, chỉ đánh dấu sau khi gửi thành công', async () => {
    const item = {
      batchId: 'batch',
      status: 'DRAFT',
      reviewer: { email: 'teacher@example.test' },
      reviewerId: 'teacher',
      batch: { confirmer: null },
      firstReview: { dueAt: '2026-11-26T23:00:00+07:00' },
      secondReview: null,
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      reviewNoticeOutbox: { findMany: vi.fn().mockResolvedValue([]) },
      item: {
        findMany: vi.fn().mockResolvedValue([
          { ...item, id: '1' },
          { ...item, id: '2' },
        ]),
      },
      $transaction: vi.fn((fn: (tx: unknown) => unknown) =>
        fn({ item: { updateMany } }),
      ),
    };
    const mail = { sendMail: vi.fn().mockResolvedValue(true) };
    await new ReviewNotificationsService(prisma as never, mail as never).remind(
      new Date('2026-11-25T01:00:00.000Z'),
    );
    expect(mail.sendMail).toHaveBeenCalledOnce();
    expect(mail.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('2 câu hỏi') }),
    );
    expect(updateMany).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ reviewerId: 'teacher' }) }));
  });
});
