import { describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../../../shared/decorators/roles.decorator';
import { UserRole } from '../../auth/domain/enums/user-role.enum';
import { TeacherTasksController } from './teacher-review.controller';
import { FinalizeBatchController } from './finalize-batch.controller';

describe('review and C3 report contracts', () => {
  it('allows teacher and admin while keeping assignments scoped to the actor', async () => {
    expect(Reflect.getMetadata(ROLES_KEY, TeacherTasksController)).toEqual([
      UserRole.TEACHER,
      UserRole.ADMIN,
    ]);
    const review = {
      list: vi.fn().mockResolvedValue([
        { id: 'a', role: 'A', batchId: 'x' },
        { id: 'b', role: 'B', batchId: 'x' },
      ]),
    };
    const controller = new TeacherTasksController(review as never);
    expect(await controller.reviews({ sub: 'actor' } as never)).toEqual([
      { id: 'a', role: 'A', batchId: 'x' },
    ]);
    expect(review.list).toHaveBeenCalledWith('actor');
  });
  it('marks changed bank or missing current check as stale', async () => {
    const prisma = {
      itemBatch: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            status: 'FINAL_CHECKED',
            updatedAt: new Date(),
          }),
      },
      item: {
        findMany: vi
          .fn()
          .mockResolvedValue([
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
