import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHEN_MUST_CHANGE_PASSWORD_KEY =
  'allowWhenMustChangePassword';

/**
 * Đánh dấu endpoint vẫn được gọi khi tài khoản còn cờ `mustChangePassword`
 * (ví dụ: đổi mật khẩu, xem hồ sơ cá nhân). Mọi endpoint khác bị JwtAuthGuard chặn (403).
 */
export const AllowWhenMustChangePassword = () =>
  SetMetadata(ALLOW_WHEN_MUST_CHANGE_PASSWORD_KEY, true);
