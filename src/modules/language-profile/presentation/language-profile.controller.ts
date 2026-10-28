import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { GetProfileUseCase } from '../application/use-cases/get-profile.use-case';
import { ExportForEduZUseCase } from '../application/use-cases/export-for-eduz.use-case';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { ProfileAccessGuard } from './guards/profile-access.guard';
import { EduZApiKeyGuard } from './guards/eduz-api-key.guard';

@Controller('placement-profiles')
export class LanguageProfileController {
  constructor(
    private readonly getProfileUseCase: GetProfileUseCase,
    private readonly exportForEduZUseCase: ExportForEduZUseCase,
  ) {}

  /**
   * Sinh viên / Giảng viên / Admin xem profile
   * Áp dụng ProfileAccessGuard tra cứu qua MSSV :studentCode (Quyết định A12).
   */
  @Get(':studentCode')
  @UseGuards(JwtAuthGuard, ProfileAccessGuard)
  async getProfile(@Req() req: any) {
    const target = req.targetStudent;
    return this.getProfileUseCase.execute(target.userId);
  }

  /**
   * Endpoint xuất JSON cho EduZ Ecosystem qua M2M API Key
   */
  @Get(':studentCode/eduz-export')
  @UseGuards(EduZApiKeyGuard, ProfileAccessGuard)
  async exportForEduZ(@Req() req: any, @Param('studentCode') studentCode: string) {
    const target = req.targetStudent;
    return this.exportForEduZUseCase.execute(target.userId, studentCode);
  }
}
