import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { GetProfileUseCase } from '../application/use-cases/get-profile.use-case';
import { GetStudentHistoryUseCase } from '../application/use-cases/get-student-history.use-case';
import { ExportForEduZUseCase } from '../application/use-cases/export-for-eduz.use-case';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { ProfileAccessGuard } from './guards/profile-access.guard';
import { EduZApiKeyGuard } from './guards/eduz-api-key.guard';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiParam,
  ApiSecurity,
} from '@nestjs/swagger';
import {
  EduZProfileResponseDto,
  LanguageProfileResponseDto,
  StudentHistoryResponseDto,
} from './profile-response.dto';

@Controller('placement-profiles')
export class LanguageProfileController {
  constructor(
    private readonly getProfileUseCase: GetProfileUseCase,
    private readonly getStudentHistoryUseCase: GetStudentHistoryUseCase,
    private readonly exportForEduZUseCase: ExportForEduZUseCase,
  ) {}

  /**
   * Sinh viên / Giảng viên / Admin xem profile
   * Áp dụng ProfileAccessGuard tra cứu qua MSSV :studentCode (Quyết định A12).
   */
  @Get(':studentCode')
  @ApiBearerAuth()
  @ApiParam({ name: 'studentCode', type: String })
  @ApiOkResponse({ type: LanguageProfileResponseDto })
  @UseGuards(JwtAuthGuard, ProfileAccessGuard)
  async getProfile(@Req() req: any) {
    const target = req.targetStudent;
    return this.getProfileUseCase.execute(target.userId);
  }

  /**
   * Lịch sử làm bài thi của sinh viên (UCSV06 / S07)
   */
  @Get(':studentCode/history')
  @ApiBearerAuth()
  @ApiParam({ name: 'studentCode', type: String })
  @ApiOkResponse({ type: StudentHistoryResponseDto, isArray: true })
  @UseGuards(JwtAuthGuard, ProfileAccessGuard)
  async getHistory(@Req() req: any) {
    const target = req.targetStudent;
    return this.getStudentHistoryUseCase.execute(target.userId);
  }

  /**
   * Endpoint xuất JSON cho EduZ Ecosystem qua M2M API Key
   */
  @Get(':studentCode/eduz-export')
  @ApiSecurity('eduzApiKey')
  @ApiOkResponse({ type: EduZProfileResponseDto })
  @UseGuards(EduZApiKeyGuard, ProfileAccessGuard)
  async exportForEduZ(
    @Req() req: any,
    @Param('studentCode') studentCode: string,
  ) {
    const target = req.targetStudent;
    return this.exportForEduZUseCase.execute(target.userId, studentCode);
  }
}
