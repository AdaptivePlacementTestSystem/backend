import { describe, expect, it, vi } from 'vitest';
import { LiteLlmClient } from './litellm-client';

const config = {
  baseUrl: 'http://localhost:4000',
  apiKey: 'test-key',
  model: 'test-model',
  timeoutMs: 50,
  maxPromptChars: 1000,
  maxResponseBytes: 4096,
  maxOutputTokens: 100,
};

describe('LiteLlmClient', () => {
  it('gửi yêu cầu và trả lại model cùng token thực tế', async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'returned-model',
          choices: [{ finish_reason: 'stop', message: { content: 'answer' } }],
          usage: { prompt_tokens: 4, completion_tokens: 2 },
        }),
      ),
    );
    const result = await new LiteLlmClient(config, transport).generate(
      'prompt',
    );
    expect(result).toEqual({
      content: 'answer',
      model: 'returned-model',
      promptTokens: 4,
      completionTokens: 2,
    });
    expect(transport).toHaveBeenCalledOnce();
    const [url, request] = transport.mock.calls[0];
    expect(url).toBe('http://localhost:4000/v1/chat/completions');
    expect(JSON.parse(request.body)).toEqual({
      model: 'test-model',
      messages: [{ role: 'user', content: 'prompt' }],
      max_tokens: 100,
    });
  });

  it('không thử lại 429 và không đưa body lỗi vào exception', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(
        new Response('sensitive provider body', { status: 429 }),
      );
    await expect(
      new LiteLlmClient(config, transport).generate('prompt'),
    ).rejects.toThrow('LITELLM_HTTP_429');
    expect(transport).toHaveBeenCalledOnce();
  });

  it('từ chối phản hồi thiếu content hoặc model', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { content: 'x' } }],
          }),
        ),
      );
    await expect(
      new LiteLlmClient(config, transport).generate('prompt'),
    ).rejects.toThrow('LITELLM_RESPONSE_INVALID');
  });

  it('không đưa nội dung phản hồi JSON lỗi vào exception', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(new Response('sensitive invalid response'));
    await expect(
      new LiteLlmClient(config, transport).generate('prompt'),
    ).rejects.toThrow('LITELLM_RESPONSE_INVALID');
  });

  it('hủy yêu cầu khi quá thời gian', async () => {
    const transport = vi.fn(
      (_url: unknown, request: RequestInit) =>
        new Promise((_resolve, reject) =>
          request.signal?.addEventListener('abort', () =>
            reject(new Error('ABORTED')),
          ),
        ),
    );
    await expect(
      new LiteLlmClient(config, transport as typeof fetch).generate('prompt'),
    ).rejects.toThrow('LITELLM_TIMEOUT');
  });

  it('từ chối cấu hình sai trước khi gọi', () => {
    expect(
      () => new LiteLlmClient({ ...config, baseUrl: 'file:///secret' }),
    ).toThrow('LITELLM_URL_INVALID');
    expect(() => new LiteLlmClient({ ...config, timeoutMs: 0 })).toThrow(
      'LITELLM_CONFIG_INVALID',
    );
  });

  it('chặn prompt rỗng hoặc vượt giới hạn trước khi gọi', async () => {
    const transport = vi.fn();
    const client = new LiteLlmClient(config, transport);
    await expect(client.generate(' ')).rejects.toThrow(
      'LITELLM_PROMPT_INVALID',
    );
    await expect(client.generate('x'.repeat(1001))).rejects.toThrow(
      'LITELLM_PROMPT_INVALID',
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it('chặn phản hồi vượt kích thước, không chấp nhận bị cắt hay từ chối', async () => {
    const over = vi.fn().mockResolvedValue(new Response('x'.repeat(4097)));
    await expect(
      new LiteLlmClient(config, over).generate('ok'),
    ).rejects.toThrow('LITELLM_RESPONSE_TOO_LARGE');
    for (const choice of [
      { finish_reason: 'length', message: { content: 'partial' } },
      {
        finish_reason: 'stop',
        message: { content: 'text', refusal: 'refused' },
      },
    ]) {
      const transport = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ model: 'test', choices: [choice] })),
        );
      await expect(
        new LiteLlmClient(config, transport).generate('ok'),
      ).rejects.toThrow('LITELLM_RESPONSE_INCOMPLETE');
    }
  });

  it('không tiết lộ chi tiết lỗi kết nối', async () => {
    const transport = vi
      .fn()
      .mockRejectedValue(new Error('sensitive network error'));
    await expect(
      new LiteLlmClient(config, transport).generate('ok'),
    ).rejects.toThrow('LITELLM_NETWORK_ERROR');
  });
});
