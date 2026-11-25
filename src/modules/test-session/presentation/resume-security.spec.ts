import { describe, expect, it, vi } from 'vitest';
import { TestSessionController } from './test-session.controller';

describe('resume response', () => {
  it('does not disclose the answer or IRT parameters of the current item', async () => {
    const resume = {
      execute: vi.fn().mockResolvedValue({
        currentItem: {
          id: 'i',
          content: 'Question',
          options: { A: 'one' },
          skill: 'GRAMMAR',
          cefrTarget: 'A1',
          correctAnswer: 'A',
          irtB: 1,
        },
        state: { state: 'WAITING_FOR_ANSWER' },
      }),
    };
    const repository = {
      findById: vi.fn().mockResolvedValue({ studentId: 's' }),
    };
    const controller = new TestSessionController(
      {} as any,
      {} as any,
      resume as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      repository as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const result = await controller.resumeSession('session', {
      sub: 's',
      role: 'STUDENT',
    } as any);
    expect(result.currentItem).toEqual({
      id: 'i',
      content: 'Question',
      options: { A: 'one' },
      skill: 'GRAMMAR',
      cefrTarget: 'A1',
    });
    expect(result.currentItem).not.toHaveProperty('correctAnswer');
    expect(result.currentItem).not.toHaveProperty('irtB');
  });
});
