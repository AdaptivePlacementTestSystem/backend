/**
 * Domain Entity Explanation — Lời giải thích tự động sinh bởi Gemini Flash.
 * Quyết định chốt: Gắn 1:1 với Item (1 Item - 0..1 Explanation), sinh lazy 1 lần và dùng chung.
 */
export class ExplanationEntity {
  constructor(
    public readonly id: string,
    public readonly itemId: string,
    public readonly content: string,
    public readonly generatedAt: Date = new Date(),
  ) {}
}
