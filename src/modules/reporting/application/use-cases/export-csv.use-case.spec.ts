import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportCsvUseCase } from './export-csv.use-case';
import { NotFoundException } from '@nestjs/common';

describe('ExportCsvUseCase', () => {
  let useCase: ExportCsvUseCase;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      examRound: {
        findUnique: vi.fn(),
      },
      languageProfile: {
        findMany: vi.fn(),
      },
    };
    useCase = new ExportCsvUseCase(prisma);
  });

  it('chống CSV Injection: thêm dấu nháy đơn trước các ký tự =, +, -, @ (SRS 15.3)', async () => {
    prisma.languageProfile.findMany.mockResolvedValue([
      {
        studentId: 'st-1',
        student: {
          fullName: '=SUM(A1:A10)',
          email: '-malicious@test.com',
          studentProfile: {
            studentCode: '@SV001',
          },
        },
        cefrLevel: 'B1',
        theta: 0.45,
        standardError: 0.32,
        completedAt: new Date('2026-11-18T10:00:00Z'),
      },
    ]);

    const { content, filename } = await useCase.execute(undefined, 'profiles');

    // Chứa UTF-8 BOM
    expect(content.startsWith('\uFEFF')).toBe(true);

    // Kiểm tra các trường bị sanitize (bắt đầu bằng nháy đơn)
    expect(content).toContain("'@SV001");
    expect(content).toContain("'=SUM(A1:A10)");
    expect(content).toContain("'-malicious@test.com");
    expect(filename).toContain('placement-test-report-toan-he-thong-profiles-');
  });

  it('xuất loại distribution: trả về phân phối CEFR theo chuẩn', async () => {
    prisma.languageProfile.findMany.mockResolvedValue([
      { cefrLevel: 'B1' },
      { cefrLevel: 'B1' },
      { cefrLevel: 'A2' },
    ]);

    const { content } = await useCase.execute(undefined, 'distribution');

    expect(content.startsWith('\uFEFF')).toBe(true);
    expect(content).toContain('CEFRLevel,StudentCount,Percentage');
    expect(content).toContain('B1,2,66.7%');
    expect(content).toContain('A2,1,33.3%');
  });

  it('khi không có dữ liệu: trả về tệp chỉ có dòng tiêu đề', async () => {
    prisma.languageProfile.findMany.mockResolvedValue([]);

    const { content } = await useCase.execute(undefined, 'profiles');

    expect(content.startsWith('\uFEFF')).toBe(true);
    expect(content.slice(1).trim()).toBe(
      'StudentCode,FullName,Email,CEFRLevel,Theta,StandardError,CompletedAt',
    );
  });

  it('examRoundId không tồn tại: ném NotFoundException (404)', async () => {
    prisma.examRound.findUnique.mockResolvedValue(null);

    await expect(useCase.execute('invalid-round-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
