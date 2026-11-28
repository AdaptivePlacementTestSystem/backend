import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ErrorCode } from '@apt/shared-types';

export interface ExportCsvResult {
  filename: string;
  content: string;
}

function sanitizeCsv(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  // SRS 15.3: Chống CSV Injection bằng cách thêm dấu nháy đơn trước các ký tự công thức
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

@Injectable()
export class ExportCsvUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    examRoundId?: string,
    type: 'profiles' | 'distribution' = 'profiles',
  ): Promise<ExportCsvResult> {
    let roundName = 'toan-he-thong';
    if (examRoundId) {
      const round = await this.prisma.examRound.findUnique({
        where: { id: examRoundId },
        select: { id: true, name: true },
      });
      if (!round) {
        throw new NotFoundException({
          code: ErrorCode.NOT_FOUND,
          message: 'Không tìm thấy kỳ thi.',
        });
      }
      roundName = round.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `placement-test-report-${roundName}-${type}-${dateStr}.csv`;
    const bom = '\uFEFF';

    const where: any = {};
    if (examRoundId) {
      where.testSession = { examRoundId };
    }

    if (type === 'distribution') {
      const profiles = await this.prisma.languageProfile.findMany({
        where,
        select: { cefrLevel: true },
      });

      const counts: Record<string, number> = {
        PRE_A1: 0,
        A1: 0,
        A2: 0,
        B1: 0,
        B2: 0,
        C1_PLUS: 0,
      };

      for (const p of profiles) {
        counts[p.cefrLevel] = (counts[p.cefrLevel] || 0) + 1;
      }

      const total = profiles.length;
      const header = 'CEFRLevel,StudentCount,Percentage\n';
      const rows = Object.entries(counts).map(([level, count]) => {
        const pct =
          total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0.0%';
        const levelName = level === 'C1_PLUS' ? 'C1+' : level;
        return `${sanitizeCsv(levelName)},${count},${pct}`;
      });

      return {
        filename,
        content: bom + header + rows.join('\n'),
      };
    }

    // Default: 'profiles'
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

    const header =
      'StudentCode,FullName,Email,CEFRLevel,Theta,StandardError,CompletedAt\n';

    if (profiles.length === 0) {
      return {
        filename,
        content: bom + header,
      };
    }

    const rows = profiles.map((p) => {
      const code = sanitizeCsv(p.student?.studentProfile?.studentCode || 'N/A');
      const name = sanitizeCsv(p.student?.fullName || '');
      const email = sanitizeCsv(p.student?.email || '');
      const cefr = sanitizeCsv(p.cefrLevel === 'C1_PLUS' ? 'C1+' : p.cefrLevel);
      const theta = p.theta.toFixed(2);
      const se = p.standardError.toFixed(2);
      const date = p.completedAt.toISOString();

      return `${code},${name},${email},${cefr},${theta},${se},${date}`;
    });

    return {
      filename,
      content: bom + header + rows.join('\n'),
    };
  }
}
