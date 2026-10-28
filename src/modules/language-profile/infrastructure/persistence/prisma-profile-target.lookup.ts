import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

export interface StudentTargetInfo {
  userId: string;
}

@Injectable()
export class PrismaProfileTargetLookup {
  constructor(private readonly prisma: PrismaService) {}

  async findStudentByCode(studentCode: string): Promise<StudentTargetInfo | null> {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { studentCode },
      select: {
        userId: true,
      },
    });

    if (!profile) {
      return null;
    }

    return {
      userId: profile.userId,
    };
  }
}
