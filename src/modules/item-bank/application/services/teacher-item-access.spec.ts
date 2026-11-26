import { describe, expect, it, vi } from 'vitest';
import { TeacherItemAccess } from './teacher-item-access';
describe('quyền xem câu của GV', () => {
  it('B chỉ thấy câu sau khi A xử lý hết phần của mình trong lô', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'own-a',
          batchId: 'batch',
          reviewerId: 'me',
          confirmerId: 'other',
        },
        {
          id: 'own-b',
          batchId: 'batch',
          reviewerId: 'reviewer',
          confirmerId: 'me',
        },
      ])
      .mockResolvedValueOnce([{ batchId: 'batch', reviewerId: 'reviewer' }]);
    const access = new TeacherItemAccess({ item: { findMany } } as never);
    expect(await access.allowedIds('me')).toEqual(['own-a']);
  });
  it('chặn xem câu không thuộc phân công', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const access = new TeacherItemAccess({ item: { findMany } } as never);
    await expect(access.assertAllowed('me', 'not-mine')).rejects.toThrow();
  });
});
