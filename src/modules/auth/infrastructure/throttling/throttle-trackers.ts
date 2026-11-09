function normalizedEmail(req: Record<string, any>): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/** Đăng nhập: giới hạn theo (IP + email) — D3, DECISIONS_LOG #134. */
export const loginTracker = (req: Record<string, any>): string =>
  `${String(req.ip ?? 'unknown')}:${normalizedEmail(req)}`;

/** Quên mật khẩu: giới hạn theo email (chống spam hộp thư của một người). */
export const forgotPasswordTracker = (req: Record<string, any>): string =>
  normalizedEmail(req) || String(req.ip ?? 'unknown');
