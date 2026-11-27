import { EmbeddingClient } from '../domain/embedding-client';
import {
  openAiCompatibleUrl,
  resolveGatewayKey,
} from './openai-compatible-url';

/** Gọi endpoint /v1/embeddings của LiteLLM (định dạng OpenAI). Không ghi nội dung vào log. */
export class LiteLlmEmbeddingClient implements EmbeddingClient {
  constructor(
    private readonly opts: {
      baseUrl: string;
      apiKey: string;
      model: string;
      timeoutMs?: number;
    },
  ) {}

  get model(): string {
    return this.opts.model;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const res = await fetch(
      openAiCompatibleUrl(this.opts.baseUrl, 'embeddings'),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.opts.apiKey}`,
        },
        body: JSON.stringify({ model: this.opts.model, input: texts }),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 60000),
        redirect: 'error',
      },
    );
    if (!res.ok) throw new Error(`EMBEDDING_HTTP_${res.status}`);
    const body = (await res.json()) as {
      data?: Array<{ index: number; embedding: number[] }>;
    };
    const data = body.data;
    if (
      !Array.isArray(data) ||
      data.length !== texts.length ||
      data.some(
        (entry) =>
          !entry ||
          !Number.isInteger(entry.index) ||
          entry.index < 0 ||
          entry.index >= texts.length ||
          !Array.isArray(entry.embedding) ||
          entry.embedding.length === 0 ||
          entry.embedding.some(
            (value) => typeof value !== 'number' || !Number.isFinite(value),
          ),
      ) ||
      new Set(data.map((entry) => entry.index)).size !== texts.length ||
      new Set(data.map((entry) => entry.embedding.length)).size !== 1
    )
      throw new Error('EMBEDDING_INVALID_RESPONSE');
    return [...data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}

/** Trả về null khi chưa đặt LITELLM_EMBED_MODEL (T3 tắt mặc định). */
export function createEmbeddingClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingClient | null {
  const model = env.LITELLM_EMBED_MODEL?.trim();
  const baseUrl = env.LITELLM_BASE_URL?.trim();
  const apiKey = resolveGatewayKey(baseUrl, env);
  if (!model || !baseUrl || !apiKey) return null;
  return new LiteLlmEmbeddingClient({ baseUrl, apiKey, model });
}
