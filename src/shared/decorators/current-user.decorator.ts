import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
  sub: string; // users.id (UUID)
  role: string; // UserRole
  email: string;
}

/**
 * @CurrentUser() — lấy JWT payload từ request sau khi JwtAuthGuard pass.
 * Dùng trong controller thay vì @Req() để tránh phụ thuộc Express trực tiếp.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);
