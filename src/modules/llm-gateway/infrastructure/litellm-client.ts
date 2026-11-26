import { LlmClient, LlmResult } from '../domain/llm-client';

export interface LiteLlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxPromptChars: number;
  maxResponseBytes: number;
  maxOutputTokens: number;
}

/** Retry và fallback do LiteLLM quản lý; lớp này không thử lại lời gọi. */
export class LiteLlmClient implements LlmClient {
  constructor(
    private readonly config: LiteLlmConfig,
    private readonly transport: typeof fetch = fetch,
  ) {
    let url: URL;
    try {
      url = new URL(config.baseUrl);
    } catch {
      throw new Error('LITELLM_URL_INVALID');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error('LITELLM_URL_INVALID');
    }
    if (
      !config.apiKey.trim() ||
      !config.model.trim() ||
      !Number.isSafeInteger(config.timeoutMs) ||
      config.timeoutMs < 1 ||
      !Number.isSafeInteger(config.maxPromptChars) ||
      config.maxPromptChars < 1 ||
      !Number.isSafeInteger(config.maxResponseBytes) ||
      config.maxResponseBytes < 1 ||
      !Number.isSafeInteger(config.maxOutputTokens) ||
      config.maxOutputTokens < 1
    ) {
      throw new Error('LITELLM_CONFIG_INVALID');
    }
  }

  async generate(prompt: string): Promise<LlmResult> {
    if (
      typeof prompt !== 'string' ||
      !prompt.trim() ||
      prompt.length > this.config.maxPromptChars
    ) {
      throw new Error('LITELLM_PROMPT_INVALID');
    }
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.config.timeoutMs);
    try {
      const response = await this.transport(
        `${this.config.baseUrl.replace(/\/$/, '')}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: this.config.maxOutputTokens,
          }),
          signal: abort.signal,
          redirect: 'error',
        },
      );
      if (!response.ok) throw new Error(`LITELLM_HTTP_${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('LITELLM_RESPONSE_INVALID');
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > this.config.maxResponseBytes) {
            await reader.cancel();
            throw new Error('LITELLM_RESPONSE_TOO_LARGE');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      let body: unknown;
      try {
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        body = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        );
      } catch {
        throw new Error('LITELLM_RESPONSE_INVALID');
      }
      if (!body || typeof body !== 'object')
        throw new Error('LITELLM_RESPONSE_INVALID');
      const data = body as Record<string, unknown>;
      const choices = data.choices;
      const first = Array.isArray(choices)
        ? (choices[0] as
            | {
                finish_reason?: unknown;
                message?: { content?: unknown; refusal?: unknown };
              }
            | undefined)
        : undefined;
      const content = first?.message?.content;
      if (!first || !first.message) throw new Error('LITELLM_RESPONSE_INVALID');
      if (first.finish_reason !== 'stop' || first.message.refusal) {
        throw new Error('LITELLM_RESPONSE_INCOMPLETE');
      }
      if (
        typeof content !== 'string' ||
        !content.trim() ||
        typeof data.model !== 'string' ||
        !data.model.trim()
      ) {
        throw new Error('LITELLM_RESPONSE_INVALID');
      }
      const usage =
        data.usage && typeof data.usage === 'object'
          ? (data.usage as Record<string, unknown>)
          : {};
      const tokenCount = (value: unknown): number | null =>
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
          ? value
          : null;
      return {
        content,
        model: data.model,
        promptTokens: tokenCount(usage.prompt_tokens),
        completionTokens: tokenCount(usage.completion_tokens),
      };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        /^LITELLM_(HTTP_\d+|RESPONSE_INVALID|RESPONSE_INCOMPLETE|RESPONSE_TOO_LARGE)$/.test(
          error.message,
        )
      ) {
        throw error;
      }
      if (abort.signal.aborted) throw new Error('LITELLM_TIMEOUT');
      throw new Error('LITELLM_NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }
  }
}
