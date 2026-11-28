import { Controller, Get, UseGuards, Res, Query } from '@nestjs/common';
import { GenerateClassReportUseCase } from '../application/use-cases/generate-class-report.use-case';
import { ExportCsvUseCase } from '../application/use-cases/export-csv.use-case';
import { GetSystemOverviewUseCase } from '../application/use-cases/get-system-overview.use-case';
import { GetErrorPatternsUseCase } from '../application/use-cases/get-error-patterns.use-case';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { OverviewQueryDto } from '../application/dto/overview-query.dto';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { Response } from 'express';
import { ApiBearerAuth, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import {
  DistributionReportDto,
  SystemOverviewDto,
} from './report-response.dto';

@Controller('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportingController {
  constructor(
    private readonly generateClassReportUseCase: GenerateClassReportUseCase,
    private readonly exportCsvUseCase: ExportCsvUseCase,
    private readonly getSystemOverviewUseCase: GetSystemOverviewUseCase,
    private readonly getErrorPatternsUseCase: GetErrorPatternsUseCase,
    private readonly prisma: PrismaService,
  ) {}

  /** Tổng quan hệ thống cho Admin (F-29, S36); chỉ ADMIN, GV không xem được. */
  @Get('overview')
  @ApiOkResponse({ type: SystemOverviewDto })
  @Roles(UserRole.ADMIN)
  async getOverview(@Query() query: OverviewQueryDto) {
    return this.getSystemOverviewUseCase.execute(query.examRoundId);
  }

  @Get(['class-distribution', 'distribution'])
  @ApiQuery({ name: 'examRoundId', required: false, type: String })
  @ApiOkResponse({ type: DistributionReportDto })
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getDistribution(@Query('examRoundId') examRoundId?: string) {
    return this.generateClassReportUseCase.execute(examRoundId);
  }

  @Get('error-patterns')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getErrorPatterns(@Query() query: OverviewQueryDto) {
    return this.getErrorPatternsUseCase.execute(query.examRoundId);
  }

  @Get('exam-rounds')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getReportExamRounds() {
    return this.prisma.examRound.findMany({
      select: { id: true, name: true },
      orderBy: { opensAt: 'desc' },
    });
  }

  @Get('export-csv')
  @ApiQuery({ name: 'examRoundId', required: false, type: String })
  @ApiOkResponse({
    content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } },
    headers: { 'Content-Disposition': { schema: { type: 'string' } } },
  })
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
