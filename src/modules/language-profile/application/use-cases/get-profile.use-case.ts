import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { GetStudentHistoryUseCase } from './get-student-history.use-case';

@Injectable()
export class GetProfileUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly getStudentHistoryUseCase: GetStudentHistoryUseCase,
  ) {}

  async execute(studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      include: {
        studentProfile: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Không tìm thấy sinh viên');
    }

    const latestProfile = await this.prisma.languageProfile.findFirst({
      where: { studentId },
      orderBy: { completedAt: 'desc' },
      include: {
        testSession: {
          select: {
            stoppingReason: true,
          },
        },
      },
    });

    const history = await this.getStudentHistoryUseCase.execute(studentId);

    let latestResult: Record<string, any> | null = null;
    if (latestProfile) {
      const [lower, upper] = latestProfile.confidenceInterval95;
      const metaObj = (latestProfile.testMetadata as Record<string, any>) || {};
      const itemsAdministered =
        typeof metaObj.itemsAdministered === 'number'
          ? metaObj.itemsAdministered
          : typeof metaObj.totalItems === 'number'
            ? metaObj.totalItems
            : null;
      const stoppingReason =
        latestProfile.testSession?.stoppingReason ??
        metaObj.stoppingReason ??
        null;

      latestResult = {
        sessionId: latestProfile.testSessionId,
        completedAt: latestProfile.completedAt.toISOString(),
        cefrLevel: latestProfile.cefrLevel,
        cefrConfidence: latestProfile.cefrConfidence,
        boundaryEffect: latestProfile.boundaryEffect,
        ability: {
          theta: latestProfile.theta,
          standardError: latestProfile.standardError,
          confidenceInterval95: [lower, upper],
        },
        meta: {
          stoppingReason,
          totalItems: itemsAdministered,
          itemsAdministered,
        },
        skillProfiles: latestProfile.skillProfiles,
        errorPatterns: latestProfile.errorPatterns,
        aiRecommendations: latestProfile.aiRecommendations,
      };
    }

    return {
      student: {
        id: student.id,
        studentCode: student.studentProfile?.studentCode || '',
        fullName: student.fullName,
        email: student.email,
      },
      latest: latestResult,
      history,
    };
  }
}
