import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComputeResultUseCase } from './compute-result.use-case';
import { StoppingReason } from '../../domain/entities/test-session.entity';
import { NotFoundException } from '@nestjs/common';
import { CEFRLevel, CEFRConfidence } from '@prisma/client';

describe('ComputeResultUseCase', () => {
  let useCase: ComputeResultUseCase;
  let sessionRepository: any;
  let prisma: any;

  beforeEach(() => {
    sessionRepository = {
      complete: vi.fn().mockResolvedValue(undefined),
    };
    prisma = {
      testSession: {
        findUnique: vi.fn(),
      },
      languageProfile: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    useCase = new ComputeResultUseCase(sessionRepository, prisma);
  });

  it('quăng NotFoundException nếu không tìm thấy phiên', async () => {
    prisma.testSession.findUnique.mockResolvedValue(null);
    await expect(
      useCase.execute('invalid', 0.5, 0.3, StoppingReason.SE_THRESHOLD),
    ).rejects.toThrow(NotFoundException);
  });

  it('tính toán chính xác skillProfiles và errorPatterns theo Phương án 1 (Q-D)', async () => {
    const mockSession = {
      id: 'session-123',
      studentId: 'student-456',
      responses: [
        {
          isCorrect: true,
          item: { skill: 'VOCABULARY', topicTag: 'Idioms' },
        },
        {
          isCorrect: false,
          item: { skill: 'VOCABULARY', topicTag: 'Phrasal Verbs' },
        },
        {
          isCorrect: true,
          item: { skill: 'GRAMMAR', topicTag: 'Tenses' },
        },
        {
          isCorrect: false,
          item: { skill: 'GRAMMAR', topicTag: 'Conditionals' },
        },
        {
          isCorrect: false,
          item: { skill: 'GRAMMAR', topicTag: 'Conditionals' },
        },
      ],
    };

    prisma.testSession.findUnique.mockResolvedValue(mockSession);

    await useCase.execute('session-123', 0.85, 0.31, StoppingReason.SE_THRESHOLD);

    expect(sessionRepository.complete).toHaveBeenCalledWith(
      'session-123',
      0.85,
      0.31,
      StoppingReason.SE_THRESHOLD,
    );

    expect(prisma.languageProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: 'student-456',
          testSessionId: 'session-123',
          theta: 0.85,
          standardError: 0.31,
          cefrLevel: CEFRLevel.B1,
          cefrConfidence: CEFRConfidence.HIGH,
          skillProfiles: expect.arrayContaining([
            expect.objectContaining({
              skill: 'VOCABULARY',
              itemsAdministered: 2,
              correctCount: 1,
            }),
            expect.objectContaining({
              skill: 'GRAMMAR',
              itemsAdministered: 3,
              correctCount: 1,
            }),
          ]),
          errorPatterns: expect.arrayContaining([
            expect.objectContaining({
              topicTag: 'Conditionals',
              skill: 'GRAMMAR',
              correctCount: 0,
              itemsAttempted: 2,
              severity: 'HIGH',
            }),
          ]),
        }),
      }),
    );
  });
});
