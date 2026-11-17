import { describe, it, expect } from 'vitest';
import {
  forgotPasswordTracker,
  ipTracker,
  loginTracker,
} from './throttle-trackers';

describe('throttle trackers', () => {
  it('login: khóa theo IP + email đã chuẩn hóa', () => {
    expect(loginTracker({ ip: '1.2.3.4', body: { email: ' A@B.com ' } })).toBe(
      '1.2.3.4:a@b.com',
    );
  });

  it('login: cùng IP khác email là hai bộ đếm khác nhau', () => {
    const a = loginTracker({ ip: '1.2.3.4', body: { email: 'a@b.com' } });
    const b = loginTracker({ ip: '1.2.3.4', body: { email: 'c@d.com' } });
    expect(a).not.toBe(b);
  });

  it('forgot: khóa theo email, không phụ thuộc IP', () => {
    const a = forgotPasswordTracker({
      ip: '1.1.1.1',
      body: { email: 'A@B.com' },
    });
    const b = forgotPasswordTracker({
      ip: '2.2.2.2',
      body: { email: 'a@b.com' },
    });
    expect(a).toBe(b);
  });

  it('thiếu hoặc sai kiểu email: không ném lỗi, rơi về IP', () => {
    expect(forgotPasswordTracker({ ip: '9.9.9.9', body: {} })).toBe('9.9.9.9');
    expect(forgotPasswordTracker({ ip: '9.9.9.9', body: { email: 42 } })).toBe(
      '9.9.9.9',
    );
    expect(loginTracker({ ip: '9.9.9.9' })).toBe('9.9.9.9:');
  });

  it('reset: khóa chỉ theo IP, không phụ thuộc email', () => {
    expect(ipTracker({ ip: '5.6.7.8', body: { email: 'a@b.com' } })).toBe(
      '5.6.7.8',
    );
    expect(ipTracker({})).toBe('unknown');
  });
});
