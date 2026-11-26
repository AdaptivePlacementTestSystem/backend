import { LlmClient, LlmResult } from '../../llm-gateway/domain/llm-client';
import {
  CandidateCheck,
  validateGeneratedCandidates,
} from './validate-generated-candidates';

export interface GeneratedCandidates {
  response: LlmResult;
  checks: CandidateCheck[];
}

/** Sinh ứng viên và kiểm hình thức; không ghi ngân hàng hay duyệt câu. */
export async function generateCandidates(
  client: LlmClient,
  prompt: string,
  maxCandidates: number,
): Promise<GeneratedCandidates> {
  if (!prompt.trim()) throw new Error('PROMPT_REQUIRED');
  if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 1) {
    throw new Error('CANDIDATE_LIMIT_INVALID');
  }
  const response = await client.generate(prompt);
  return {
    response,
    checks: validateGeneratedCandidates(response.content, maxCandidates),
  };
}
