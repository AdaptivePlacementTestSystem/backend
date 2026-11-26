/** Cổng gọi LLM. Nội dung và lỗi không được ghi vào log tại lớp này. */
export interface LlmClient {
  generate(prompt: string): Promise<LlmResult>;
}

export interface LlmResult {
  content: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
}
