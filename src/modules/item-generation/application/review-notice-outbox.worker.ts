import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import type { IMailPort } from '../../mail/domain/ports/mail.port';

@Injectable()
export class ReviewNoticeOutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewNoticeOutboxWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopped = false;
  constructor(
    private readonly prisma: PrismaService,
    @Inject('IMailPort') private readonly mail: IMailPort,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => this.start(), 5000);
    this.timer.unref();
    this.start();
  }
  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  private start() {
    if (this.stopped || this.running) return;
    this.running = this.processOne()
      .catch(() => this.logger.error('Không xử lý được thông báo giao việc.'))
      .finally(() => {
        this.running = undefined;
      });
  }
  async processOne() {
    let noticeId: string | undefined;
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              batchId: string;
              recipientId: string;
              attempts: number;
            }>
          >`
          SELECT id, batch_id AS "batchId", recipient_id AS "recipientId", attempts FROM review_notice_outbox
          WHERE status = 'PENDING' AND available_at <= now() ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1`;
          const notice = rows[0];
          if (!notice) return;
          noticeId = notice.id;
          await tx.$queryRaw`SELECT id FROM item_batches WHERE id = ${notice.batchId}::uuid FOR UPDATE`;
          const batch = await tx.itemBatch.findUnique({
            where: { id: notice.batchId },
            select: { status: true, confirmerId: true },
          });
          if (
            !batch ||
            batch.status !== 'IN_REVIEW' ||
            batch.confirmerId !== notice.recipientId
          ) {
            await tx.reviewNoticeOutbox.update({
              where: { id: notice.id },
              data: { status: 'CANCELLED' },
            });
            return;
          }
          const recipient = await tx.user.findUnique({
            where: { id: notice.recipientId },
            select: { email: true, role: true, isActive: true },
          });
          if (!recipient || !recipient.isActive || recipient.role !== 'TEACHER')
            throw new Error('RECIPIENT_UNAVAILABLE');
          const pending = await tx.item.findMany({
            where: {
              batchId: notice.batchId,
              status: { in: ['DRAFT', 'FIRST_APPROVED'] },
            },
            select: { secondReview: true },
          });
          if (!pending.length) {
            await tx.reviewNoticeOutbox.update({
              where: { id: notice.id },
              data: { status: 'CANCELLED' },
            });
            return;
          }
          const dueDates = pending.flatMap(({ secondReview }) => {
            if (
              !secondReview ||
              typeof secondReview !== 'object' ||
              Array.isArray(secondReview) ||
              typeof secondReview.dueAt !== 'string'
            )
              return [];
            const value = new Date(secondReview.dueAt);
            return Number.isFinite(value.getTime()) ? [value.getTime()] : [];
          });
          const due = dueDates.length
            ? ` Hạn sớm nhất: ${new Date(Math.min(...dueDates)).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`
            : '';
          const sent = await this.mail.sendMail({
            to: recipient.email,
            subject: '[APT] Phân công xác nhận câu hỏi',
            text: `Bạn được phân công xác nhận ${pending.length} câu trong lô.${due} Vui lòng mở hộp việc để xử lý.`,
          });
          if (!sent) throw new Error('MAIL_NOT_SENT');
          await tx.item.updateMany({
            where: {
              batchId: notice.batchId,
              status: { in: ['DRAFT', 'FIRST_APPROVED'] },
            },
            data: { secondAssignmentNoticeSent: true },
          });
          await tx.reviewNoticeOutbox.update({
            where: { id: notice.id },
            data: { status: 'SENT', attempts: { increment: 1 } },
          });
        },
        { timeout: 30000 },
      );
    } catch {
      if (noticeId)
        await this.prisma.reviewNoticeOutbox
          .updateMany({
            where: { id: noticeId, status: 'PENDING' },
            data: {
              attempts: { increment: 1 },
              availableAt: new Date(Date.now() + 60000),
            },
          })
          .catch(() => undefined);
      this.logger.warn('Chưa gửi được thông báo giao việc; sẽ thử lại.');
    }
  }
}
