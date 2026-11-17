import { Controller, Get, UseGuards, Res, Query } from '@nestjs/common';
import { GenerateClassReportUseCase } from '../application/use-cases/generate-class-report.use-case';
import { ExportCsvUseCase } from '../application/use-cases/export-csv.use-case';
import { GetSystemOverviewUseCase } from '../application/use-cases/get-system-overview.use-case';
import { OverviewQueryDto } from '../application/dto/overview-query.dto';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { Response } from 'express';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportingController {
  constructor(
    private readonly generateClassReportUseCase: GenerateClassReportUseCase,
    private readonly exportCsvUseCase: ExportCsvUseCase,
    private readonly getSystemOverviewUseCase: GetSystemOverviewUseCase,
  ) {}

  /** Tổng quan hệ thống cho Admin (F-29, S36); chỉ ADMIN, GV không xem được. */
  @Get('overview')
  @Roles(UserRole.ADMIN)
  async getOverview(@Query() query: OverviewQueryDto) {
    return this.getSystemOverviewUseCase.execute(query.examRoundId);
  }

  @Get(['class-distribution', 'distribution'])
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getDistribution(@Query('examRoundId') examRoundId?: string) {
    return this.generateClassReportUseCase.execute(examRoundId);
  }

  @Get('export-csv')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async exportCsv(
    @Query('examRoundId') examRoundId: string | undefined,
    @Res() res: Response,
  ) {
    const csvContent = await this.exportCsvUseCase.execute(examRoundId);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="placement-test-report.csv"',
    );
    return res.send(csvContent);
  }
}
