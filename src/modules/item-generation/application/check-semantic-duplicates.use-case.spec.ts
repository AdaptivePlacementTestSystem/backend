import { describe, expect, it, vi } from 'vitest';
import { CheckSemanticDuplicatesUseCase } from './check-semantic-duplicates.use-case';

describe('semantic duplicate checks', () => {
  const item = { id: 'one', content: 'Example', contentHash: 'hash' };
  function setup(vectors: unknown, others: unknown[] = []) {
    const db = {
      item: { findMany: vi.fn().mockResolvedValue([item]) },
      itemEmbedding: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce(others),
        upsert: vi.fn(),
      },
      itemCheckResult: { createMany: vi.fn() },
      $transaction: vi.fn((fn) =>
        fn({ $executeRaw: vi.fn().mockResolvedValue(1) }),
      ),
    };
    const embedder = {
      model: 'test',
      embed: vi.fn().mockResolvedValue(vectors),
    };
    return {
      db,
      check: new CheckSemanticDuplicatesUseCase(db as never, embedder),
    };
  }

  it.each([
    { vectors: [] },
    { vectors: [[]] },
    { vectors: [[0, 0]] },
    { vectors: [[Number.NaN, 1]] },
    { vectors: [[1], [2]] },
  ])('rejects malformed provider output $vectors', async ({ vectors }) => {
    const { db, check } = setup(vectors);
    await expect(check.execute('batch')).rejects.toThrow();
    expect(db.itemEmbedding.upsert).not.toHaveBeenCalled();
  });

  it('rejects a stored embedding of incompatible dimensions', async () => {
    const { check } = setup([[1, 2]], [{ itemId: 'other', vector: [1] }]);
    await expect(check.execute('batch')).rejects.toThrow();
  });

  it('accepts valid embeddings and flags a match', async () => {
    const { db, check } = setup(
      [[1, 2]],
      [{ itemId: 'other', vector: [1, 2] }],
    );
    await expect(check.execute('batch')).resolves.toMatchObject({
      checked: 1,
      flagged: 1,
    });
    expect(db.itemCheckResult.createMany).toHaveBeenCalledOnce();
  });
});
