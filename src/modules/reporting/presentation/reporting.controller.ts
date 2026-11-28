import { Controller, Get, UseGuards, Res, Query } from '@nestjs/common';
import { GenerateClassReportUseCase } from '../application/use-cases/generate-class-report.use-case';
import { GetClassErrorPatternsUseCase } from '../application/use-cases/get-class-error-patterns.use-case';
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
  ClassErrorPatternDto,
  DistributionReportDto,
  SystemOverviewDto,
} from './report-response.dto';

@Controller('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportingController {
  constructor(
    private readonly generateClassReportUseCase: GenerateClassReportUseCase,
    private readonly getClassErrorPatternsUseCase: GetClassErrorPatternsUseCase,
    private readonly exportCsvUseCase: ExportCsvUseCase,
    private readonly getSystemOverviewUseCase: GetSystemOverviewUseCase,
    private readonly getErrorPatternsUseCase?: GetErrorPatternsUseCase,
    private readonly prisma?: PrismaService,
  ) {}

  /** Tổng quan hệ thống cho Admin (F-29, S36); chỉ ADMIN, GV không xem được. */
  @Get('overview')
  @ApiOkResponse({ type: SystemOverviewDto })
  @Roles(UserRole.ADMIN)
  async getOverview(@Query() query: OverviewQueryDto) {
    return this.getSystemOverviewUseCase.execute(query.examRoundId);
  }

  /** Phân phối CEFR, có thể lọc theo kỳ thi (UCGV07, BR-13, S12). */
  @Get(['class-distribution', 'distribution'])
  @ApiQuery({ name: 'examRoundId', required: false, type: String })
  @ApiOkResponse({ type: DistributionReportDto })
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getDistribution(@Query('examRoundId') examRoundId?: string) {
    return this.generateClassReportUseCase.execute(examRoundId);
  }

  /** Chủ đề sai phổ biến, có thể lọc theo kỳ thi (UCGV07, S12). */
  @Get('error-patterns')
  @ApiQuery({ name: 'examRoundId', required: false, type: String })
  @ApiOkResponse({ type: ClassErrorPatternDto, isArray: true })
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getErrorPatterns(
    @Query('examRoundId') examRoundId?: string | OverviewQueryDto,
  ) {
    const roundId =
      typeof examRoundId === 'string'
        ? examRoundId
        : (examRoundId as OverviewQueryDto)?.examRoundId;
    return this.getClassErrorPatternsUseCase.execute(roundId);
  }

  @Get('exam-rounds')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
        },
      },
    },
  })
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async getReportExamRounds() {
    return (
      this.prisma?.examRound.findMany({
        select: { id: true, name: true },
        orderBy: { opensAt: 'desc' },
      }) ?? []
    );
  }

  /** Xuất báo cáo thống kê ra tệp CSV (UCGV08, S12). */
  @Get('export-csv')
  @ApiQuery({ name: 'examRoundId', required: false, type: String })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['profiles', 'distribution'],
  })
  @ApiOkResponse({
    content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } },
    headers: { 'Content-Disposition': { schema: { type: 'string' } } },
  })
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  async exportCsv(
    @Query('examRoundId') examRoundId: string | undefined,
    @Query('type') type: 'profiles' | 'distribution' | undefined,
    @Res() res: Response,
  ) {
    const result = await this.exportCsvUseCase.execute(examRoundId, type);

    const content = typeof result === 'string' ? result : result.content;
    const filename =
      typeof result === 'string'
        ? 'placement-test-report.csv'
        : result.filename;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return res.send(content);
  }
}
