import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { InProcessMailQueue } from './in-process-mail-queue';

const config = (over: Record<string, number> = {}) =>
  ({
    get: (key: string) =>
      ({
        'mail.queueConcurrency': 2,
        'mail.queueMaxAttempts': 3,
        'mail.queueBackoffMs': 0,
        ...over,
      })[key],
  }) as any;

const mail = (n: number) => ({
  email: `u${n}@e.com`,
  fullName: `N${n}`,
  tempPassword: `Secret#Pw-${n}`,
  studentCode: `S${n}`,
});

describe('InProcessMailQueue', () => {
  let mailPort: any;

  beforeEach(() => {
    mailPort = { sendTemporaryPassword: vi.fn().mockResolvedValue(true) };
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('trả ngay số thư đã xếp hàng (không chờ gửi) rồi gửi nền đủ từng thư', async () => {
    const queue = new InProcessMailQueue(mailPort, config());

    const queued = queue.enqueueTemporaryPasswords([mail(1), mail(2), mail(3)]);
    expect(queued).toBe(3);
    await queue.idle();

    expect(mailPort.sendTemporaryPassword).toHaveBeenCalledTimes(3);
    expect(mailPort.sendTemporaryPassword).toHaveBeenCalledWith(
      'u1@e.com',
      'N1',
      'Secret#Pw-1',
      'S1',
    );
  });

  it('không vượt độ song song cấu hình', async () => {
    let running = 0;
    let peak = 0;
    mailPort.sendTemporaryPassword.mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return true;
    });
    const queue = new InProcessMailQueue(
      mailPort,
      config({ 'mail.queueConcurrency': 2 }),
    );

    queue.enqueueTemporaryPasswords(
      Array.from({ length: 8 }, (_, i) => mail(i)),
    );
    await queue.idle();

    expect(peak).toBe(2);
    expect(mailPort.sendTemporaryPassword).toHaveBeenCalledTimes(8);
  });

  it('thử lại khi gửi lỗi rồi thành công: tổng số lần gọi bằng số lần thử', async () => {
    mailPort.sendTemporaryPassword
      .mockRejectedValueOnce(new Error('SMTP tạm lỗi'))
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const queue = new InProcessMailQueue(mailPort, config());

    queue.enqueueTemporaryPasswords([mail(1)]);
    await queue.idle();

    expect(mailPort.sendTemporaryPassword).toHaveBeenCalledTimes(3);
  });

  it('hết số lần thử thì bỏ cuộc, không ném lỗi, các thư khác vẫn gửi', async () => {
    mailPort.sendTemporaryPassword.mockImplementation(async (email: string) => {
      if (email === 'u1@e.com') throw new Error('hỏng mãi');
      return true;
    });
    const queue = new InProcessMailQueue(
      mailPort,
      config({ 'mail.queueMaxAttempts': 2 }),
    );

    queue.enqueueTemporaryPasswords([mail(1), mail(2)]);
    await queue.idle();

    const calls = mailPort.sendTemporaryPassword.mock.calls.map(
      (c: string[]) => c[0],
    );
    expect(calls.filter((e: string) => e === 'u1@e.com')).toHaveLength(2);
    expect(calls).toContain('u2@e.com');
  });

  it('không ghi mật khẩu tạm vào log', async () => {
    mailPort.sendTemporaryPassword.mockRejectedValue(new Error('lỗi'));
    const queue = new InProcessMailQueue(
      mailPort,
      config({ 'mail.queueMaxAttempts': 1 }),
    );

    queue.enqueueTemporaryPasswords([mail(1)]);
    await queue.idle();

    const logged = [
      ...(Logger.prototype.warn as any).mock.calls,
      ...(Logger.prototype.error as any).mock.calls,
    ]
      .flat()
      .join(' ');
    expect(logged).toContain('u1@e.com');
    expect(logged).not.toContain('Secret#Pw');
  });

  it('idle() trả về ngay khi hàng đợi trống', async () => {
    await expect(
      new InProcessMailQueue(mailPort, config()).idle(),
    ).resolves.toBeUndefined();
  });

  it('xếp hàng thêm trong lúc đang gửi vẫn được gửi hết', async () => {
    const queue = new InProcessMailQueue(mailPort, config());
    queue.enqueueTemporaryPasswords([mail(1)]);
    queue.enqueueTemporaryPasswords([mail(2), mail(3)]);
    await queue.idle();

    expect(mailPort.sendTemporaryPassword).toHaveBeenCalledTimes(3);
  });
});
