import { Controller, Get, UseGuards, Res, Query } from '@nestjs/common';
import { GenerateClassReportUseCase } from '../application/use-cases/generate-class-report.use-case';
import { GetClassErrorPatternsUseCase } from '../application/use-cases/get-class-error-patterns.use-case';
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
    private readonly getClassErrorPatternsUseCase: GetClassErrorPatternsUseCase,
    private readonly exportCsvUseCase: ExportCsvUseCase,
    private readonly getSystemOverviewUseCase: GetSystemOverviewUseCase,
  ) {}

  /** Tổng quan hệ thống cho Admin (F-29, S36); chỉ ADMIN, GV không xem được. */
  @Get('overview')
  @Roles(UserRole.ADMIN)
  async getOverview(@Query() query: OverviewQueryDto) {
    return this.getSystemOverviewUseCase.execute(query.examRoundId);
  }

  /** Phân phối CEFR toàn lớp, có thể lọc theo kỳ thi (UCGV07, BR-13, S12). */
  @Get(['class-distribution', 'distribution'])
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getDistribution(@Query('examRoundId') examRoundId?: string) {
    return this.generateClassReportUseCase.execute(examRoundId);
  }

  /** Chủ đề sai phổ biến toàn lớp, có thể lọc theo kỳ thi (UCGV07, S12). */
  @Get('error-patterns')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getErrorPatterns(@Query('examRoundId') examRoundId?: string) {
    return this.getClassErrorPatternsUseCase.execute(examRoundId);
  }

  /** Xuất báo cáo lớp học ra tệp CSV (UCGV08, S12). */
  @Get('export-csv')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async exportCsv(
    @Query('examRoundId') examRoundId: string | undefined,
    @Query('type') type: 'profiles' | 'distribution' | undefined,
    @Res() res: Response,
  ) {
    const { filename, content } = await this.exportCsvUseCase.execute(
      examRoundId,
      type,
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return res.send(content);
  }
}
