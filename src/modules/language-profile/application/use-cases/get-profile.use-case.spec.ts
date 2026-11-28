import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetProfileUseCase } from './get-profile.use-case';
import { NotFoundException } from '@nestjs/common';

describe('GetProfileUseCase', () => {
  let useCase: GetProfileUseCase;
  let prisma: any;
  let historyUseCase: any;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: vi.fn(),
      },
      languageProfile: {
        findFirst: vi.fn(),
      },
    };
    historyUseCase = {
      execute: vi.fn(),
    };
    useCase = new GetProfileUseCase(prisma, historyUseCase);
  });

  it('trả về thông tin sinh viên, hồ sơ mới nhất và lịch sử các lần thi', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      fullName: 'Nguyễn Văn A',
      email: 'a@truong.edu.vn',
      studentProfile: {
        studentCode: 'SV20260001',
      },
    });

    prisma.languageProfile.findFirst.mockResolvedValue({
      id: 'prof-1',
      studentId: 'user-1',
      testSessionId: 'sess-1',
      completedAt: new Date('2026-11-15T10:00:00Z'),
      cefrLevel: 'B1',
      cefrConfidence: 'HIGH',
      boundaryEffect: false,
      theta: 0.25,
      standardError: 0.31,
      confidenceInterval95: [-0.36, 0.86],
      skillProfiles: [
        { skill: 'VOCABULARY', itemsAttempted: 12, itemsCorrect: 9 },
      ],
      errorPatterns: [{ topicTag: 'past_simple', count: 2 }],
      aiRecommendations: ['Ôn tập thì quá khứ đơn'],
      testMetadata: { totalItems: 24 },
      testSession: { stoppingReason: 'SE_REACHED' },
    });

    historyUseCase.execute.mockResolvedValue([
      { sessionId: 'sess-1', cefrLevel: 'B1' },
    ]);

    const result = await useCase.execute('user-1');

    expect(result.student.studentCode).toBe('SV20260001');
    expect(result.student.fullName).toBe('Nguyễn Văn A');
    expect(result.latest?.cefrLevel).toBe('B1');
    expect(result.latest?.ability.theta).toBe(0.25);
    expect(result.latest?.meta.totalItems).toBe(24);
    expect(result.latest?.meta.itemsAdministered).toBe(24);
    expect(result.history).toHaveLength(1);
  });

  it('đọc đúng itemsAdministered và không mặc định 25 khi thiếu totalItems', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-3',
      fullName: 'Lê Văn C',
      email: 'c@truong.edu.vn',
      studentProfile: { studentCode: 'SV20260003' },
    });

    prisma.languageProfile.findFirst.mockResolvedValue({
      id: 'prof-3',
      studentId: 'user-3',
      testSessionId: 'sess-3',
      completedAt: new Date('2026-11-16T10:00:00Z'),
      cefrLevel: 'A2',
      cefrConfidence: 'HIGH',
      boundaryEffect: false,
      theta: -0.5,
      standardError: 0.35,
      confidenceInterval95: [-1.2, 0.2],
      skillProfiles: [],
      errorPatterns: [],
      aiRecommendations: [],
      testMetadata: { itemsAdministered: 17, stoppingReason: 'MAX_ITEMS' },
      testSession: null,
    });
    historyUseCase.execute.mockResolvedValue([]);

    const result = await useCase.execute('user-3');

    expect(result.latest?.meta.totalItems).toBe(17);
    expect(result.latest?.meta.itemsAdministered).toBe(17);
    expect(result.latest?.meta.stoppingReason).toBe('MAX_ITEMS');
  });

  it('sinh viên chưa thi lần nào: trả về student, latest=null và history rỗng', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-2',
      fullName: 'Trần Thị B',
      email: 'b@truong.edu.vn',
      studentProfile: {
        studentCode: 'SV20260002',
      },
    });

    prisma.languageProfile.findFirst.mockResolvedValue(null);
    historyUseCase.execute.mockResolvedValue([]);

    const result = await useCase.execute('user-2');

    expect(result.student.studentCode).toBe('SV20260002');
    expect(result.latest).toBeNull();
    expect(result.history).toEqual([]);
  });

  it('sinh viên không tồn tại: ném NotFoundException (404)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(useCase.execute('non-existent-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
