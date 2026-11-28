import { describe, expect, it, vi } from 'vitest';
import { TeacherItemAccess } from './teacher-item-access';
describe('quyền xem câu của GV', () => {
  it('B thấy từng câu đã duyệt theo người xác nhận hiện tại của lô', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ id: 'own-a' }, { id: 'own-b' }]);
    const access = new TeacherItemAccess({ item: { findMany } } as never);
    expect(await access.allowedIds('me')).toEqual(['own-a', 'own-b']);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { reviewerId: 'me' },
            {
              batch: { confirmerId: 'me' },
              status: {
                in: ['FIRST_APPROVED', 'SECOND_APPROVED', 'FINAL_APPROVED'],
              },
            },
          ],
        },
      }),
    );
  });
  it('chặn xem câu không thuộc phân công', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const access = new TeacherItemAccess({ item: { findMany } } as never);
    await expect(access.assertAllowed('me', 'not-mine')).rejects.toThrow();
  });
});
