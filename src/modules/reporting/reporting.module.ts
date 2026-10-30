import { Module } from '@nestjs/common';
import { ReportingController } from './presentation/reporting.controller';
import { GenerateClassReportUseCase } from './application/use-cases/generate-class-report.use-case';
import { ExportCsvUseCase } from './application/use-cases/export-csv.use-case';

@Module({
  controllers: [ReportingController],
  providers: [GenerateClassReportUseCase, ExportCsvUseCase],
  exports: [GenerateClassReportUseCase, ExportCsvUseCase],
})
export class ReportingModule {}
