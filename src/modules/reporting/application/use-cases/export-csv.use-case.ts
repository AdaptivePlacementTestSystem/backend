import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

@Injectable()
export class ExportCsvUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(examRoundId?: string): Promise<string> {
    const where: any = {};
    if (examRoundId) {
      where.testSession = { examRoundId };
    }

    const profiles = await this.prisma.languageProfile.findMany({
      where,
      include: {
        student: {
          include: {
            studentProfile: true,
          },
        },
      },
      orderBy: { completedAt: 'desc' },
    });

    const header = 'StudentCode,FullName,Email,CEFRLevel,Theta,StandardError,CompletedAt\n';
    const rows = profiles.map((p) => {
      const code = p.student?.studentProfile?.studentCode || 'N/A';
      const name = `"${p.student?.fullName || ''}"`;
      const email = p.student?.email || '';
      const cefr = p.cefrLevel === 'C1_PLUS' ? 'C1+' : p.cefrLevel;
      const theta = p.theta.toFixed(2);
      const se = p.standardError.toFixed(2);
      const date = p.completedAt.toISOString();

      return `${code},${name},${email},${cefr},${theta},${se},${date}`;
    });

    return header + rows.join('\n');
  }
}
