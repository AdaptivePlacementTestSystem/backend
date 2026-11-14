import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IMailPort } from '../../domain/ports/mail.port';
import type {
  IMailQueue,
  TemporaryPasswordMail,
} from '../../domain/ports/mail-queue.port';

interface QueueItem {
  mail: TemporaryPasswordMail;
  attempts: number;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Hàng đợi gửi email trong tiến trình: độ song song nhỏ, thử lại có chờ tăng dần, ghi log lỗi.
 * Hạn chế đã biết: mất hàng đợi nếu backend tắt giữa chừng (Admin dùng "Gửi lại mật khẩu tạm");
 * không có nhà cung cấp SMTP nào chịu được gửi hàng nghìn thư mỗi ngày bằng Gmail miễn phí (Q-5).
 */
@Injectable()
export class InProcessMailQueue implements IMailQueue {
  private readonly logger = new Logger(InProcessMailQueue.name);
  private readonly pending: QueueItem[] = [];
  private active = 0;
  private idleWaiters: Array<() => void> = [];

  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly backoffMs: number;

  constructor(
    @Inject('IMailPort') private readonly mailPort: IMailPort,
    config: ConfigService,
  ) {
    this.concurrency = Math.max(
      1,
      config.get<number>('mail.queueConcurrency') ?? 3,
    );
    this.maxAttempts = Math.max(
      1,
      config.get<number>('mail.queueMaxAttempts') ?? 3,
    );
    this.backoffMs = Math.max(
      0,
      config.get<number>('mail.queueBackoffMs') ?? 1000,
    );
  }

  enqueueTemporaryPasswords(items: TemporaryPasswordMail[]): number {
    for (const mail of items) this.pending.push({ mail, attempts: 0 });
    this.pump();
    return items.length;
  }

  /** Chờ tới khi hàng đợi trống và không còn thư đang gửi (dùng cho test và tắt máy êm). */
  idle(): Promise<void> {
    if (this.pending.length === 0 && this.active === 0)
      return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const item = this.pending.shift()!;
      this.active++;
      void this.process(item).finally(() => {
        this.active--;
        this.pump();
        if (this.pending.length === 0 && this.active === 0) {
          const waiters = this.idleWaiters;
          this.idleWaiters = [];
          waiters.forEach((resolve) => resolve());
        }
      });
    }
  }

  private async process(item: QueueItem): Promise<void> {
    const { mail } = item;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const sent = await this.mailPort.sendTemporaryPassword(
          mail.email,
          mail.fullName,
          mail.tempPassword,
          mail.studentCode,
        );
        if (sent) return;
        this.logger.warn(
          `Gửi mật khẩu tạm cho ${mail.email} không thành công (lần ${attempt}/${this.maxAttempts})`,
        );
      } catch (error) {
        this.logger.warn(
          `Lỗi gửi mật khẩu tạm cho ${mail.email} (lần ${attempt}/${this.maxAttempts}): ${(error as Error).message}`,
        );
      }
      if (attempt < this.maxAttempts) await sleep(this.backoffMs * attempt);
    }
    // Bỏ cuộc: không rollback tài khoản (BR-05); Admin dùng "Gửi lại mật khẩu tạm". Không ghi mật khẩu vào log.
    this.logger.error(
      `Bỏ gửi mật khẩu tạm cho ${mail.email} sau ${this.maxAttempts} lần thử`,
    );
  }
}
