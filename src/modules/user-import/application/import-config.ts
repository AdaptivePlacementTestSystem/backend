import { ConfigService } from '@nestjs/config';

/** Cấu hình import (đọc từ biến môi trường qua ConfigService, không hardcode). */
export interface ImportConfig {
  maxFileBytes: number;
  maxRows: number;
  hashConcurrency: number;
}

export const IMPORT_CONFIG = 'ImportConfig';

export const importConfigFrom = (config: ConfigService): ImportConfig => ({
  maxFileBytes: config.get<number>('accountImport.maxFileBytes') ?? 2097152,
  maxRows: config.get<number>('accountImport.maxRows') ?? 1000,
  hashConcurrency: config.get<number>('accountImport.hashConcurrency') ?? 4,
});
