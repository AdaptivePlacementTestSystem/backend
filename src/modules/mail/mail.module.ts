import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmtpMailAdapter } from './infrastructure/adapters/smtp-mail.adapter';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'IMailPort',
      useClass: SmtpMailAdapter,
    },
    SmtpMailAdapter,
  ],
  exports: ['IMailPort', SmtpMailAdapter],
})
export class MailModule {}
