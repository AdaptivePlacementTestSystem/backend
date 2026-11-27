import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckIndependentAnswerUseCase } from './check-independent-answer.use-case';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('kiểm tra đáp án độc lập', () => {
  it('không gửi đáp án gốc cho mô hình và ghi cờ khi kết quả khác', async () => {
    vi.stubEnv('LITELLM_BASE_URL', 'https://example.invalid');
    vi.stubEnv('LITELLM_API_KEY', 'key');
    vi.stubEnv('LITELLM_MODEL', 'model');
    const fetcher = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            model: 'model',
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: JSON.stringify({
                    answer: 'B',
                    explanationSupportsAnswer: true,
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    const prisma = {
      item: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'i',
            content: 'Question',
            options: { A: 'one', B: 'two', C: 'three', D: 'four' },
            correctAnswer: 'A',
            explanation: { content: 'Why' },
            contentHash: 'hash',
          },
        ]),
      },
      itemCheckResult: { create: vi.fn() },
      $transaction: vi.fn((fn) => fn({ $executeRaw: vi.fn().mockResolvedValue(1) })),
    };
    const result = await new CheckIndependentAnswerUseCase(
      prisma as never,
    ).execute('batch', 'C1');
    expect(result.flagged).toBe(1);
    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(request.messages[0].content).not.toContain('correctAnswer');
    expect(request.messages[0].content).not.toContain('Why');
    expect(fetcher).toHaveBeenCalledTimes(2);
    const secondRequest = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(secondRequest.messages[0].content).toContain('Why');
    expect(secondRequest.messages[0].content).toContain('selectedAnswer');
    expect(prisma.itemCheckResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          level: 'SOFT',
          reasonCodes: [
            'INDEPENDENT_ANSWER_CHECKED',
            'INDEPENDENT_ANSWER_MISMATCH',
          ],
        }),
      }),
    );
    prisma.itemCheckResult.create.mockClear();
    fetcher.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            model: 'model',
            choices: [
              { finish_reason: 'stop', message: { content: '{"answer":"B"}' } },
            ],
          }),
          { status: 200 },
        ),
    );
    fetcher.mockImplementationOnce(
      async () => new Response('bad response', { status: 200 }),
    );
    await expect(
      new CheckIndependentAnswerUseCase(prisma as never).execute('batch', 'C1'),
    ).rejects.toThrow();
    expect(prisma.itemCheckResult.create).not.toHaveBeenCalled();
  });
});
