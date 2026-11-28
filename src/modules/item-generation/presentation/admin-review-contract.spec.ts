import { describe, expect, it, vi } from 'vitest';
import { FinalizeBatchController } from './finalize-batch.controller';

describe('review and C3 report contracts', () => {
  it('marks changed bank or missing current check as stale', async () => {
    const prisma = {
      itemBatch: {
        findUnique: vi.fn().mockResolvedValue({
          status: 'FINAL_CHECKED',
          updatedAt: new Date(),
        }),
      },
      item: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'i',
            status: 'SECOND_APPROVED',
            contentHash: 'new',
            checkResults: [
              {
                contentHash: 'old',
                reasonCodes: ['INDEPENDENT_ANSWER_CHECKED'],
              },
            ],
          },
        ]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const controller = new FinalizeBatchController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      prisma as never,
    );
    expect(await controller.report('batch')).toMatchObject({
      stale: true,
      items: [{ id: 'i', stale: true }],
    });
  });
});
