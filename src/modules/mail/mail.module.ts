import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmtpMailAdapter } from './infrastructure/adapters/smtp-mail.adapter';
import { InProcessMailQueue } from './infrastructure/queue/in-process-mail-queue';
import { MAIL_QUEUE } from './domain/ports/mail-queue.port';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'IMailPort',
      useClass: SmtpMailAdapter,
    },
    SmtpMailAdapter,
    // Hàng đợi gửi email hàng loạt (import tài khoản); đổi sang BullMQ chỉ cần thay useClass
    {
      provide: MAIL_QUEUE,
      useClass: InProcessMailQueue,
    },
  ],
  exports: ['IMailPort', SmtpMailAdapter, MAIL_QUEUE],
})
export class MailModule {}
