import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import type { IMailPort } from '../../mail/domain/ports/mail.port';

/** 08:00 giờ Việt Nam của ngày trước ngày hết hạn. */
export function reviewReminderAt(due: Date): Date {
  const vn = new Date(due.getTime() + 7 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() - 1, 1),
  );
}

@Injectable()
export class ReviewNotificationsService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ReviewNotificationsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    @Inject('IMailPort') private readonly mail: IMailPort,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.sweep(), 60_000);
    this.timer.unref();
    void this.sweep();
  }

  private async sweep() {
    try {
      const batches = await this.prisma.item.findMany({
        where: {
          batch: { status: 'IN_REVIEW' },
          OR: [
            { status: 'DRAFT', firstAssignmentNoticeSent: false },
            {
              status: { in: ['DRAFT', 'FIRST_APPROVED'] },
              secondAssignmentNoticeSent: false,
            },
          ],
        },
        select: { batchId: true },
        distinct: ['batchId'],
      });
      for (const batch of batches) await this.assigned(batch.batchId);
      await this.remind();
    } catch {
      this.logger.error('Không thể kiểm tra email giao việc');
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async assigned(batchId: string) {
    const pendingNotices = await this.prisma.reviewNoticeOutbox.findMany({
      where: { batchId, status: 'PENDING' },
      select: { recipientId: true },
    });
    const blockedRecipients = new Set(
      pendingNotices.map((entry) => entry.recipientId),
    );
    const items = await this.prisma.item.findMany({
      where: { batchId, status: { in: ['DRAFT', 'FIRST_APPROVED'] } },
      select: {
        id: true,
        status: true,
        firstAssignmentNoticeSent: true,
        secondAssignmentNoticeSent: true,
        reviewerId: true,
        firstReview: true,
        secondReview: true,
        batch: { select: { confirmer: { select: { id: true, email: true } } } },
        reviewer: { select: { email: true } },
      },
    });
    const groups = new Map<
      string,
      {
        email: string;
        userId: string;
        role: 'A' | 'B';
        ids: string[];
        due: string;
      }
    >();
    for (const item of items)
      for (const role of ['A', 'B'] as const) {
        if (
          role === 'A' &&
          (item.status !== 'DRAFT' || item.firstAssignmentNoticeSent)
        )
          continue;
        if (role === 'B' && item.secondAssignmentNoticeSent) continue;
        const user = role === 'A' ? item.reviewer : item.batch.confirmer;
        const id = role === 'A' ? item.reviewerId : item.batch.confirmer?.id;
        if (role === 'B' && id && blockedRecipients.has(id)) continue;
        const review = role === 'A' ? item.firstReview : item.secondReview;
        const due =
          review &&
          typeof review === 'object' &&
          !Array.isArray(review) &&
          typeof review.dueAt === 'string'
            ? review.dueAt
            : '';
        if (!user?.email || !id || !due) continue;
        const key = `${role}:${id}:${due}`;
        const group = groups.get(key) ?? {
          email: user.email,
          userId: id,
          role,
          ids: [],
          due,
        };
        group.ids.push(item.id);
        groups.set(key, group);
      }
    for (const group of groups.values())
      try {
        await this.prisma.$transaction(
          async (tx) => {
            const a = group.role === 'A';
            const claimed = await tx.item.updateMany({
              where: {
                id: { in: group.ids },
                status: a ? 'DRAFT' : { in: ['DRAFT', 'FIRST_APPROVED'] },
                batch: {
                  is: {
                    status: 'IN_REVIEW',
                    ...(a ? {} : { confirmerId: group.userId }),
                  },
                },
                ...(a
                  ? {
                      reviewerId: group.userId,
                      firstAssignmentNoticeSent: false,
                      firstReview: { path: ['dueAt'], equals: group.due },
                    }
                  : {
                      secondAssignmentNoticeSent: false,
                      secondReview: { path: ['dueAt'], equals: group.due },
                    }),
              },
              data: a
                ? { firstAssignmentNoticeSent: true }
                : { secondAssignmentNoticeSent: true },
            });
            if (!claimed.count) return;
            const sent = await this.mail.sendMail({
              to: group.email,
              subject: '[APT] Công việc thẩm định câu hỏi',
              text: `Bạn được giao ${claimed.count} câu hỏi vai ${group.role}. Hạn: ${new Date(group.due).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}. Vui lòng mở hộp việc để xử lý.`,
            });
            if (!sent) throw new Error('MAIL_NOT_SENT');
          },
          { timeout: 30000 },
        );
      } catch {
        this.logger.error('Không gửi được email giao việc; cần kiểm tra SMTP');
      }
  }

  async remind(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const items = await this.prisma.item.findMany({
        where: {
          batch: { status: 'IN_REVIEW' },
          OR: [
            { status: 'DRAFT', firstReminderSent: false },
            {
              status: { in: ['DRAFT', 'FIRST_APPROVED'] },
              secondReminderSent: false,
            },
          ],
        },
        select: {
          id: true,
          batchId: true,
          status: true,
          firstReminderSent: true,
          secondReminderSent: true,
          reviewer: { select: { email: true } },
          reviewerId: true,
          firstReview: true,
          secondReview: true,
          batch: {
            select: { confirmer: { select: { id: true, email: true } } },
          },
        },
      });
      const groups = new Map<
        string,
        {
          ids: string[];
          email: string;
          userId: string;
          role: 'A' | 'B';
          due: Date;
          rawDue: string;
        }
      >();
      const pendingNotices = await this.prisma.reviewNoticeOutbox.findMany({
        where: {
          status: 'PENDING',
          batchId: { in: [...new Set(items.map((item) => item.batchId))] },
        },
        select: { batchId: true, recipientId: true },
      });
      const blocked = new Set(
        pendingNotices.map((entry) => `${entry.batchId}:${entry.recipientId}`),
      );
      for (const item of items)
        for (const role of ['A', 'B'] as const) {
          const a = role === 'A';
          if (a && (item.status !== 'DRAFT' || item.firstReminderSent))
            continue;
          if (!a && item.secondReminderSent) continue;
          const review = a ? item.firstReview : item.secondReview;
          const email = a ? item.reviewer?.email : item.batch.confirmer?.email;
          const userId = a ? item.reviewerId : item.batch.confirmer?.id;
          if (!a && userId && blocked.has(`${item.batchId}:${userId}`))
            continue;
          const value =
            review && typeof review === 'object' && !Array.isArray(review)
              ? review.dueAt
              : null;
          if (typeof value !== 'string' || !email || !userId) continue;
          const due = new Date(value);
          if (
            !Number.isFinite(due.getTime()) ||
            now < reviewReminderAt(due) ||
            now >= due
          )
            continue;
          const key = `${item.batchId}:${a ? 'A' : 'B'}:${email}:${value}`;
          const group = groups.get(key) ?? {
            ids: [],
            email,
            userId,
            role: a ? 'A' : 'B',
            due,
            rawDue: value,
          };
          group.ids.push(item.id);
          groups.set(key, group);
        }
      for (const group of groups.values()) {
        try {
          await this.prisma.$transaction(
            async (tx) => {
              const a = group.role === 'A';
              const claimed = await tx.item.updateMany({
                where: {
                  id: { in: group.ids },
                  status: a ? 'DRAFT' : { in: ['DRAFT', 'FIRST_APPROVED'] },
                  batch: {
                    is: {
                      status: 'IN_REVIEW',
                      ...(a ? {} : { confirmerId: group.userId }),
                    },
                  },
                  ...(a
                    ? {
                        reviewerId: group.userId,
                        firstReminderSent: false,
                        firstReview: { path: ['dueAt'], equals: group.rawDue },
                      }
                    : {
                        secondReminderSent: false,
                        secondReview: { path: ['dueAt'], equals: group.rawDue },
                      }),
                },
                data: a
                  ? { firstReminderSent: true }
                  : { secondReminderSent: true },
              });
              if (!claimed.count) return;
              const sent = await this.mail.sendMail({
                to: group.email,
                subject: '[APT] Nhắc việc thẩm định câu hỏi',
                text: `Bạn có ${claimed.count} câu hỏi vai ${group.role} chưa hoàn tất. Hạn: ${group.due.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.${group.role === 'B' ? ' Một số câu có thể đang chờ giảng viên A.' : ''} Vui lòng mở hộp việc.`,
              });
              if (!sent) throw new Error('MAIL_NOT_SENT');
            },
            { timeout: 30000 },
          );
        } catch {
          this.logger.error('Không gửi được email nhắc việc; sẽ thử lại');
        }
      }
    } catch {
      this.logger.error('Không thể kiểm tra việc cần nhắc');
    } finally {
      this.running = false;
    }
  }
}
