import { Module } from '@nestjs/common';
import { LanguageProfileController } from './presentation/language-profile.controller';
import { GetProfileUseCase } from './application/use-cases/get-profile.use-case';
import { ExportForEduZUseCase } from './application/use-cases/export-for-eduz.use-case';
import { PrismaLanguageProfileRepository } from './infrastructure/persistence/prisma-language-profile.repository';
import { PrismaProfileTargetLookup } from './infrastructure/persistence/prisma-profile-target.lookup';
import { ProfileAccessGuard } from './presentation/guards/profile-access.guard';
import { EduZApiKeyGuard } from './presentation/guards/eduz-api-key.guard';

@Module({
  controllers: [LanguageProfileController],
  providers: [
    GetProfileUseCase,
    ExportForEduZUseCase,
    PrismaLanguageProfileRepository,
    PrismaProfileTargetLookup,
    ProfileAccessGuard,
    EduZApiKeyGuard,
  ],
  exports: [PrismaLanguageProfileRepository, GetProfileUseCase],
})
export class LanguageProfileModule {}
