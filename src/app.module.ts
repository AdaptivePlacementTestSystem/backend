import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { PrismaModule } from './shared/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ItemBankModule } from './modules/item-bank/item-bank.module';
import { CatEngineModule } from './modules/cat-engine/cat-engine.module';
import { TestSessionModule } from './modules/test-session/test-session.module';
import { LanguageProfileModule } from './modules/language-profile/language-profile.module';
import { AiExplainerModule } from './modules/ai-explainer/ai-explainer.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { UserImportModule } from './modules/user-import/user-import.module';
import { UserAdminModule } from './modules/user-admin/user-admin.module';
import { ExamRoundModule } from './modules/exam-round/exam-round.module';
import { MailModule } from './modules/mail/mail.module';
import { ItemGenerationModule } from './modules/item-generation/item-generation.module';
import { LlmGatewayModule } from './modules/llm-gateway/llm-gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    PrismaModule,
    AuthModule,
    UserImportModule,
    UserAdminModule,
    ExamRoundModule,
    MailModule,
    ItemBankModule,
    ItemGenerationModule,
    LlmGatewayModule,
    CatEngineModule,
    TestSessionModule,
    LanguageProfileModule,
    AiExplainerModule,
    ReportingModule,
  ],
})
export class AppModule {}
