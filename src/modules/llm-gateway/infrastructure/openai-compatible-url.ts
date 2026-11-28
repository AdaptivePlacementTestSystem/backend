/** LiteLLM uses /v1; Gemini's OpenAI-compatible base already includes its version. */
export function openAiCompatibleUrl(
  baseUrl: string,
  endpoint: 'chat/completions' | 'embeddings',
): string {
  const base = baseUrl.replace(/\/+$/, '');
  const url = new URL(base);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('LLM_URL_INVALID');
  const isGeminiCompatibility =
    url.origin === 'https://generativelanguage.googleapis.com' &&
    url.pathname === '/v1beta/openai';
  return `${base}${isGeminiCompatibility ? '' : '/v1'}/${endpoint}`;
}

export function resolveGatewayKey(
  baseUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const explicit = env.LITELLM_API_KEY?.trim();
  if (explicit) return explicit;
  try {
    const url = new URL(baseUrl ?? '');
    if (
      url.origin === 'https://generativelanguage.googleapis.com' &&
      url.pathname.replace(/\/+$/, '') === '/v1beta/openai' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
      return env.GEMINI_API_KEY?.trim() || undefined;
  } catch {
    /* invalid configuration is handled by the caller */
  }
  return undefined;
}
