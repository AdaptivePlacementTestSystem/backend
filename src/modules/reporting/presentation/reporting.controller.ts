import { Controller, Get, UseGuards, Res, Query } from '@nestjs/common';
import { GenerateClassReportUseCase } from '../application/use-cases/generate-class-report.use-case';
import { ExportCsvUseCase } from '../application/use-cases/export-csv.use-case';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../../shared/decorators/current-user.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { Response } from 'express';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportingController {
  constructor(
    private readonly generateClassReportUseCase: GenerateClassReportUseCase,
    private readonly exportCsvUseCase: ExportCsvUseCase,
  ) {}

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
    res.setHeader('Content-Disposition', 'attachment; filename="placement-test-report.csv"');
    return res.send(csvContent);
  }
}
