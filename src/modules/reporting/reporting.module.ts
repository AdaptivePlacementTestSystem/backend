import { Module } from '@nestjs/common';
import { ReportingController } from './presentation/reporting.controller';
import { GenerateClassReportUseCase } from './application/use-cases/generate-class-report.use-case';
import { ExportCsvUseCase } from './application/use-cases/export-csv.use-case';
import { GetSystemOverviewUseCase } from './application/use-cases/get-system-overview.use-case';
import { GetErrorPatternsUseCase } from './application/use-cases/get-error-patterns.use-case';

@Module({
  controllers: [ReportingController],
  providers: [
    GenerateClassReportUseCase,
    ExportCsvUseCase,
    GetSystemOverviewUseCase,
    GetErrorPatternsUseCase,
  ],
  exports: [
    GenerateClassReportUseCase,
    ExportCsvUseCase,
    GetSystemOverviewUseCase,
  ],
})
export class ReportingModule {}
