import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiteLlmClient } from '../../llm-gateway/infrastructure/litellm-client';
import {
  ProcessAiBatchUseCase,
  resolveItemTopicTag,
} from './process-ai-batch.use-case';
import type { PrismaService } from '../../../shared/prisma/prisma.service';

const baseSamples = [
  {
    id: 'ref-1',
    content: 'Sample 1?',
    options: { A: 'a', B: 'b', C: 'c', D: 'd' },
    correctAnswer: 'A',
    irtB: -0.5,
  },
  {
    id: 'ref-2',
    content: 'Sample 2?',
    options: { A: 'a', B: 'b', C: 'c', D: 'd' },
    correctAnswer: 'B',
    irtB: 0.0,
  },
  {
    id: 'ref-3',
    content: 'Sample 3?',
    options: { A: 'a', B: 'b', C: 'c', D: 'd' },
    correctAnswer: 'C',
    irtB: 0.5,
  },
];

function createMockPrisma(
  batch: {
    id: string;
    skill: 'GRAMMAR' | 'VOCABULARY';
    cefrTarget: 'A1' | 'A2' | 'B1' | 'B2';
    topicTag: string | null;
    requestedCount: number;
  },
  createdItems: Array<Record<string, unknown>>,
) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'job-1' }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    itemBatchJob: {
      create: vi.fn().mockResolvedValue({ id: 'job-2' }),
    },
    itemBatch: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    item: {
      create: vi
        .fn()
        .mockImplementation(async (args: { data: Record<string, unknown> }) => {
          createdItems.push(args.data);
          return { id: 'item-1' };
        }),
    },
  };
  return {
    itemBatch: {
      findUnique: vi.fn().mockResolvedValue({
        source: 'AI_GENERATED',
        status: 'GENERATING',
        ...batch,
      }),
    },
    item: {
      findMany: vi.fn().mockResolvedValue(baseSamples),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;
}

describe('ProcessAiBatchUseCase — F-10 AI Question Tagging (topicTag)', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    process.env.LITELLM_BASE_URL = 'https://llm.example.test/v1';
    process.env.LITELLM_API_KEY = 'test-key';
    process.env.LITELLM_MODEL = 'test-model';
    process.env.AI_REFERENCE_EXAMPLES = '3';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...prevEnv };
  });

  it('resolveItemTopicTag ưu tiên batch.topicTag, fallback sang AI topicTag và trim gọn', () => {
    expect(resolveItemTopicTag('past_simple', 'conditionals')).toBe(
      'past_simple',
    );
    expect(resolveItemTopicTag(null, '  academic_vocab  ')).toBe(
      'academic_vocab',
    );
    expect(resolveItemTopicTag(null, '   ')).toBeNull();
    expect(resolveItemTopicTag(null, undefined)).toBeNull();
  });

  it('lưu topicTag do AI tự gán khi lô không truyền topicTag và yêu cầu topicTag trong prompt', async () => {
    const createdItems: Array<Record<string, unknown>> = [];
    const generateSpy = vi
      .spyOn(LiteLlmClient.prototype, 'generate')
      .mockResolvedValue({
        content: JSON.stringify([
          {
            content: 'She ___ to school yesterday.',
            options: { A: 'go', B: 'went', C: 'gone', D: 'going' },
            correctAnswer: 'B',
            explanation: 'Past simple tense requires "went".',
            skill: 'GRAMMAR',
            cefrTarget: 'A2',
            topicTag: 'past_simple',
            irtB: -0.2,
          },
        ]),
        model: 'test-model',
        promptTokens: 10,
        completionTokens: 20,
      });

    const prisma = createMockPrisma(
      {
        id: 'batch-1',
        skill: 'GRAMMAR',
        cefrTarget: 'A2',
        topicTag: null,
        requestedCount: 1,
      },
      createdItems,
    );

    const useCase = new ProcessAiBatchUseCase(prisma);
    await useCase.execute('batch-1', {
      jobId: 'job-1',
      batchId: 'batch-1',
      token: 'lease-token-1',
    });

    expect(generateSpy).toHaveBeenCalledTimes(1);
    const sentPrompt = generateSpy.mock.calls[0]?.[0] ?? '';
    expect(sentPrompt).toContain('topicTag');
    expect(createdItems).toHaveLength(1);
    expect(createdItems[0]?.topicTag).toBe('past_simple');
  });

  it('ưu tiên giữ batch.topicTag khi Admin đã chỉ định chủ đề cố định cho lô', async () => {
    const createdItems: Array<Record<string, unknown>> = [];
    vi.spyOn(LiteLlmClient.prototype, 'generate').mockResolvedValue({
      content: JSON.stringify([
        {
          content: 'If it rains, we ___ stay home.',
          options: { A: 'will', B: 'would', C: 'were', D: 'had' },
          correctAnswer: 'A',
          explanation: 'First conditional uses will + base verb.',
          skill: 'GRAMMAR',
          cefrTarget: 'B1',
          topicTag: 'other_topic',
          irtB: 0.1,
        },
      ]),
      model: 'test-model',
      promptTokens: 10,
      completionTokens: 20,
    });

    const prisma = createMockPrisma(
      {
        id: 'batch-2',
        skill: 'GRAMMAR',
        cefrTarget: 'B1',
        topicTag: 'conditionals',
        requestedCount: 1,
      },
      createdItems,
    );

    const useCase = new ProcessAiBatchUseCase(prisma);
    await useCase.execute('batch-2', {
      jobId: 'job-1',
      batchId: 'batch-2',
      token: 'lease-token-2',
    });

    expect(createdItems).toHaveLength(1);
    expect(createdItems[0]?.topicTag).toBe('conditionals');
  });
});
