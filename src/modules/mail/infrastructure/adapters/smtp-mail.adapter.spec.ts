import { describe, it, expect, vi } from 'vitest';
import { SmtpMailAdapter, escapeHtml } from './smtp-mail.adapter';

const configWith = (values: Record<string, unknown>) =>
  ({ get: (key: string) => values[key] }) as any;

describe('escapeHtml', () => {
  it('escape các ký tự HTML nguy hiểm', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe(
      '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;',
    );
  });
});

describe('SmtpMailAdapter khi chưa cấu hình SMTP', () => {
  it('môi trường dev: giả lập gửi thành công', async () => {
    const adapter = new SmtpMailAdapter(configWith({ nodeEnv: 'development' }));
    await expect(
      adapter.sendMail({ to: 'a@b.com', subject: 's', text: 't' }),
    ).resolves.toBe(true);
  });

  it('production: ném lỗi, không nuốt im lặng và không log nội dung', async () => {
    const adapter = new SmtpMailAdapter(configWith({ nodeEnv: 'production' }));
    const warn = vi.spyOn((adapter as any).logger, 'warn');

    await expect(
      adapter.sendMail({ to: 'a@b.com', subject: 's', text: 'OTP 123456' }),
    ).rejects.toThrow(/SMTP/);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('123456');
  });
});

describe('SmtpMailAdapter khi gửi lỗi', () => {
  it('ném lỗi của transporter để use-case xử lý', async () => {
    const adapter = new SmtpMailAdapter(
      configWith({ 'mail.user': 'u', 'mail.pass': 'p' }),
    );
    (adapter as any).transporter = {
      sendMail: vi.fn().mockRejectedValue(new Error('smtp refused')),
    };

    await expect(
      adapter.sendMail({ to: 'a@b.com', subject: 's' }),
    ).rejects.toThrow('smtp refused');
  });

  it('escape tên người dùng trong email mật khẩu tạm', async () => {
    const adapter = new SmtpMailAdapter(
      configWith({ 'mail.user': 'u', 'mail.pass': 'p' }),
    );
    const send = vi.fn().mockResolvedValue({});
    (adapter as any).transporter = { sendMail: send };

    await adapter.sendTemporaryPassword(
      'a@b.com',
      '<script>alert(1)</script>',
      'Tmp@Pass123',
    );

    const { html } = send.mock.calls[0][0];
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
