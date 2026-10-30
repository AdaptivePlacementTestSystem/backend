import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaLanguageProfileRepository } from '../../infrastructure/persistence/prisma-language-profile.repository';
import { LanguageProfileEntity } from '../../domain/entities/language-profile.entity';

@Injectable()
export class GetProfileUseCase {
  constructor(
    private readonly profileRepository: PrismaLanguageProfileRepository,
  ) {}

  async execute(studentId: string): Promise<LanguageProfileEntity> {
    const profile =
      await this.profileRepository.findLatestByStudentId(studentId);
    if (!profile) {
      throw new NotFoundException('Chưa có hồ sơ năng lực cho sinh viên này');
    }
    return profile;
  }
}
