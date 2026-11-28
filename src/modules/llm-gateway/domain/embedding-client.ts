/** Cổng embedding (T3). Chưa cấu hình mô hình thì không có bản cài đặt, T3 bị bỏ qua. */
export interface EmbeddingClient {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING_CLIENT = Symbol('EMBEDDING_CLIENT');
