import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { UserAdminModule } from '../user-admin/user-admin.module';
import { IMPORT_CONFIG, importConfigFrom } from './application/import-config';
import { ImportSaveWorker } from './application/import-save-worker';
import { DownloadImportTemplateUseCase } from './application/use-cases/download-import-template.use-case';
import {
  ClearImportGridUseCase,
  GetImportGridUseCase,
  RemoveImportRowUseCase,
} from './application/use-cases/import-grid.use-cases';
import {
  GetImportSaveStatusUseCase,
  SaveImportUseCase,
} from './application/use-cases/save-import.use-case';
import { UploadImportFileUseCase } from './application/use-cases/upload-import-file.use-case';
import {
  ACCOUNT_SPREADSHEET,
  IMPORT_GRID_STORE,
  IMPORT_JOB_STORE,
} from './domain/ports';
import { ExcelJsAccountSpreadsheet } from './infrastructure/exceljs-account-spreadsheet';
import { RedisImportStateStore } from './infrastructure/redis-import-state.store';
import { UserImportController } from './presentation/user-import.controller';

/**
 * Import tài khoản SV/GV bằng file (F-18, UCADM08, S19): đọc .xlsx, lưới tạm Redis, Lưu chạy nền.
 * Gọi sang `auth` (IUserRepository), `user-admin` (sinh mật khẩu tạm) và `mail` (hàng đợi email) qua cổng.
 */
@Module({
  imports: [
    AuthModule,
    MailModule,
    UserAdminModule,
    ConfigModule,
    // Giới hạn dung lượng file đọc từ cấu hình (multer lưu trong bộ nhớ)
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: importConfigFrom(config).maxFileBytes,
          files: 1,
        },
      }),
    }),
  ],
  controllers: [UserImportController],
  providers: [
    UploadImportFileUseCase,
    GetImportGridUseCase,
    RemoveImportRowUseCase,
    ClearImportGridUseCase,
    SaveImportUseCase,
    GetImportSaveStatusUseCase,
    DownloadImportTemplateUseCase,
    ImportSaveWorker,
    RedisImportStateStore,
    { provide: IMPORT_GRID_STORE, useExisting: RedisImportStateStore },
    { provide: IMPORT_JOB_STORE, useExisting: RedisImportStateStore },
    { provide: ACCOUNT_SPREADSHEET, useClass: ExcelJsAccountSpreadsheet },
    {
      provide: IMPORT_CONFIG,
      inject: [ConfigService],
      useFactory: importConfigFrom,
    },
  ],
})
export class UserImportModule {}
