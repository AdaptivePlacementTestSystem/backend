import { describe, expect, it, vi } from 'vitest';
import { generateCandidates } from './generate-candidates';

describe('generateCandidates', () => {
  it('gọi cổng LLM và phân loại ứng viên', async () => {
    const content = JSON.stringify([
      {
        content: 'Question',
        options: { A: 'one', B: 'two', C: 'three', D: 'four' },
        correctAnswer: 'A',
        explanation: 'Explanation',
        skill: 'GRAMMAR',
        cefrTarget: 'A2',
      },
    ]);
    const generate = vi.fn().mockResolvedValue({
      content,
      model: 'fake',
      promptTokens: null,
      completionTokens: null,
    });
    const result = await generateCandidates({ generate }, 'create items', 1);
    expect(generate).toHaveBeenCalledWith('create items');
    expect(result.checks).toEqual([{ index: 0, errors: [] }]);
    expect(result.response.model).toBe('fake');
  });

  it('từ chối đầu vào sai trước khi gọi provider', async () => {
    const generate = vi.fn();
    await expect(generateCandidates({ generate }, ' ', 1)).rejects.toThrow(
      'PROMPT_REQUIRED',
    );
    await expect(generateCandidates({ generate }, 'prompt', 0)).rejects.toThrow(
      'CANDIDATE_LIMIT_INVALID',
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it('không biến lỗi provider thành kết quả thành công', async () => {
    const generate = vi.fn().mockRejectedValue(new Error('LITELLM_HTTP_429'));
    await expect(generateCandidates({ generate }, 'prompt', 1)).rejects.toThrow(
      'LITELLM_HTTP_429',
    );
  });
});
