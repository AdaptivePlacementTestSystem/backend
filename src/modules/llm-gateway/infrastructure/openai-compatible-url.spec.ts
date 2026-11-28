import { describe, expect, it } from 'vitest';
import {
  openAiCompatibleUrl,
  resolveGatewayKey,
} from './openai-compatible-url';

describe('OpenAI compatible endpoint URLs', () => {
  it('retains the existing LiteLLM route', () => {
    expect(openAiCompatibleUrl('http://localhost:4000/', 'embeddings')).toBe(
      'http://localhost:4000/v1/embeddings',
    );
  });
  it('uses Gemini compatibility paths without appending another version', () => {
    const base = 'https://generativelanguage.googleapis.com/v1beta/openai/';
    expect(openAiCompatibleUrl(base, 'chat/completions')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    expect(openAiCompatibleUrl(base, 'embeddings')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/embeddings',
    );
  });
  it('rejects credentials and query strings in the base URL', () => {
    expect(() =>
      openAiCompatibleUrl('https://u:p@example.com', 'embeddings'),
    ).toThrow();
    expect(() =>
      openAiCompatibleUrl('https://example.com/?key=value', 'embeddings'),
    ).toThrow();
  });
  it('never forwards a Gemini key to an unrelated endpoint', () => {
    const env = { GEMINI_API_KEY: 'test-key' };
    expect(
      resolveGatewayKey(
        'https://generativelanguage.googleapis.com/v1beta/openai',
        env,
      ),
    ).toBe('test-key');
    expect(
      resolveGatewayKey('https://example.com/v1beta/openai', env),
    ).toBeUndefined();
    expect(
      resolveGatewayKey(
        'https://generativelanguage.googleapis.com/v1beta/openai?x=1',
        env,
      ),
    ).toBeUndefined();
  });
});
