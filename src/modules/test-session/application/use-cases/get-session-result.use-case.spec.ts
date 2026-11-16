import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetSessionResultUseCase } from './get-session-result.use-case';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  SessionStatus,
  StoppingReason,
} from '../../domain/entities/test-session.entity';
import { UserRole } from '../../../auth/domain/enums/user-role.enum';

describe('GetSessionResultUseCase', () => {
  let useCase: GetSessionResultUseCase;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      testSession: {
        findUnique: vi.fn(),
      },
      languageProfile: {
        findUnique: vi.fn(),
      },
    };

    useCase = new GetSessionResultUseCase(prisma);
  });

  it('quăng NotFoundException nếu không tìm thấy phiên', async () => {
    prisma.testSession.findUnique.mockResolvedValue(null);
    await expect(
      useCase.execute('invalid', 'student-1', UserRole.STUDENT),
    ).rejects.toThrow(NotFoundException);
  });

  it('quăng ForbiddenException nếu sinh viên mở phiên của người khác', async () => {
    prisma.testSession.findUnique.mockResolvedValue({
      id: 'session-1',
      studentId: 'student-2',
      status: SessionStatus.COMPLETED,
    });

    await expect(
      useCase.execute('session-1', 'student-1', UserRole.STUDENT),
    ).rejects.toThrow(ForbiddenException);
  });

  it('quăng BadRequestException nếu phiên chưa COMPLETED', async () => {
    prisma.testSession.findUnique.mockResolvedValue({
      id: 'session-1',
      studentId: 'student-1',
      status: SessionStatus.IN_PROGRESS,
    });

    await expect(
      useCase.execute('session-1', 'student-1', UserRole.STUDENT),
    ).rejects.toThrow(BadRequestException);
  });

  it('trả về đầy đủ kết quả, thước đo và phân tích kỹ năng cho màn S05', async () => {
    const startedAt = new Date('2026-11-11T08:00:00Z');
    const completedAt = new Date('2026-11-11T08:35:00Z');

    prisma.testSession.findUnique.mockResolvedValue({
      id: 'session-1',
      studentId: 'student-1',
      status: SessionStatus.COMPLETED,
      thetaFinal: 0.65,
      seFinal: 0.32,
      startedAt,
      completedAt,
      stoppingReason: StoppingReason.SE_REACHED,
      responses: [{}, {}, {}],
    });

    prisma.languageProfile.findUnique.mockResolvedValue({
      cefrLevel: 'B1',
      cefrConfidence: 'HIGH',
      boundaryEffect: false,
      confidenceInterval95: [0.02, 1.28],
      skillProfiles: [
        { skill: 'VOCABULARY', itemsAdministered: 12, correctCount: 9 },
        { skill: 'GRAMMAR', itemsAdministered: 13, correctCount: 7 },
      ],
      errorPatterns: [
        { topicTag: 'Articles', skill: 'GRAMMAR', severity: 'HIGH' },
      ],
      aiRecommendations: ['Cần luyện tập thêm mạo từ'],
    });

    const result = await useCase.execute(
      'session-1',
      'student-1',
      UserRole.STUDENT,
    );

    expect(result.sessionId).toBe('session-1');
    expect(result.cefrLevel).toBe('B1');
    expect(result.boundaryEffect).toBe(false);
    expect(result.skillProfiles).toHaveLength(2);
    expect(result.errorPatterns).toHaveLength(1);
    expect(result.durationSeconds).toBe(2100);
  });
});
