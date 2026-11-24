import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenerateClassReportUseCase } from './generate-class-report.use-case';
import { NotFoundException } from '@nestjs/common';

describe('GenerateClassReportUseCase', () => {
  let useCase: GenerateClassReportUseCase;
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
    useCase = new GenerateClassReportUseCase(prisma);
  });

  it('báo cáo toàn hệ thống: tính đúng tổng SV, số lượng theo CEFR và averageTheta', async () => {
    prisma.languageProfile.findMany.mockResolvedValue([
      { cefrLevel: 'A2', theta: -0.4 },
      { cefrLevel: 'B1', theta: 0.2 },
      { cefrLevel: 'B1', theta: 0.8 },
    ]);

    const result = await useCase.execute();

    expect(result.examRoundId).toBeNull();
    expect(result.totalStudents).toBe(3);
    expect(result.cefrDistribution.A2).toBe(1);
    expect(result.cefrDistribution.B1).toBe(2);
    expect(result.cefrDistribution.A1).toBe(0);
    expect(result.averageTheta).toBe(0.2);
  });

  it('lọc theo examRoundId: kiểm tra kỳ thi và chỉ lọc profile của kỳ đó', async () => {
    prisma.examRound.findUnique.mockResolvedValue({ id: 'round-1' });
    prisma.languageProfile.findMany.mockResolvedValue([
      { cefrLevel: 'B2', theta: 1.2 },
    ]);

    const result = await useCase.execute('round-1');

    expect(prisma.examRound.findUnique).toHaveBeenCalledWith({
      where: { id: 'round-1' },
      select: { id: true },
    });
    expect(result.examRoundId).toBe('round-1');
    expect(result.totalStudents).toBe(1);
    expect(result.cefrDistribution.B2).toBe(1);
    expect(result.averageTheta).toBe(1.2);
  });

  it('examRoundId không tồn tại: ném NotFoundException (404)', async () => {
    prisma.examRound.findUnique.mockResolvedValue(null);

    await expect(useCase.execute('non-existent-round')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('chưa có sinh viên nào hoàn thành: trả về tổng số 0 và averageTheta = 0', async () => {
    prisma.languageProfile.findMany.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result.totalStudents).toBe(0);
    expect(result.averageTheta).toBe(0);
  });
});
