import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminExamRoundsUseCase } from './admin-exam-rounds.use-case';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

const NOW = new Date('2026-11-27T08:00:00Z');
const base = {
  id: 'round',
  name: 'Thi',
  status: 'SCHEDULED',
  opensAt: new Date('2026-11-27T09:00:00Z'),
  closesAt: new Date('2026-11-27T11:00:00Z'),
  durationMinutes: 45,
};

function setup(round: typeof base | null, count = 1) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    examRound: {
      findUnique: vi.fn().mockResolvedValue(round),
      update: vi.fn().mockImplementation(({ data }) => ({ ...round, ...data })),
    },
    examRoundParticipant: { count: vi.fn().mockResolvedValue(count) },
  };
  const prisma = {
    $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
  };
  return {
    tx,
    service: new AdminExamRoundsUseCase(prisma as unknown as PrismaService),
  };
}

describe('quản lý trạng thái và thời gian kỳ thi', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('cho phép sửa kỳ nháp và giữ điều kiện khung giờ', async () => {
    const { service } = setup({ ...base, status: 'DRAFT' });
    await expect(
      service.update('round', { name: ' Tên mới ', durationMinutes: 60 }),
    ).resolves.toMatchObject({ name: 'Tên mới', durationMinutes: 60 });
    await expect(
      service.update('round', { durationMinutes: 180 }),
    ).rejects.toThrow();
    await expect(service.update('round', { name: '   ' })).rejects.toThrow();
  });

  it('kỳ đã công bố chỉ sửa thời gian và giờ mở mới phải ở tương lai', async () => {
    const { service } = setup(base);
    await expect(
      service.update('round', { closesAt: '2026-11-27T10:00:00Z' }),
    ).resolves.toMatchObject({ closesAt: new Date('2026-11-27T10:00:00Z') });
    await expect(
      service.update('round', { opensAt: NOW.toISOString() }),
    ).rejects.toThrow();
    await expect(service.update('round', { name: 'Khác' })).rejects.toThrow();
    await expect(
      service.update('round', { durationMinutes: 60 }),
    ).rejects.toThrow();
  });

  it('kỳ đang mở chỉ kéo dài giờ đóng, không sửa kỳ đã đóng', async () => {
    const open = setup({
      ...base,
      opensAt: new Date('2026-11-27T07:00:00Z'),
    }).service;
    await expect(
      open.update('round', { closesAt: '2026-11-27T12:00:00Z' }),
    ).resolves.toBeDefined();
    await expect(
      open.update('round', { closesAt: base.closesAt.toISOString() }),
    ).rejects.toThrow();
    await expect(
      open.update('round', { closesAt: '2026-11-27T10:00:00Z' }),
    ).rejects.toThrow();
    await expect(
      open.update('round', { opensAt: '2026-11-27T06:00:00Z' }),
    ).rejects.toThrow();
    const closed = setup({ ...base, status: 'CLOSED' }).service;
    await expect(
      closed.update('round', { closesAt: '2026-11-27T12:00:00Z' }),
    ).rejects.toThrow();
  });

  it('công bố nháp có thí sinh và giờ mở tương lai; từ chối các trường hợp khác', async () => {
    const draft = { ...base, status: 'DRAFT' };
    const { service, tx } = setup(draft);
    await expect(service.publish('round')).resolves.toMatchObject({
      status: 'SCHEDULED',
    });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    await expect(setup(draft, 0).service.publish('round')).rejects.toThrow();
    await expect(
      setup({ ...draft, opensAt: NOW }).service.publish('round'),
    ).rejects.toThrow();
    await expect(setup(base).service.publish('round')).rejects.toThrow();
    await expect(
      setup({ ...draft, durationMinutes: 180 }).service.publish('round'),
    ).rejects.toThrow();
    await expect(setup(null).service.publish('round')).rejects.toThrow();
  });
});
