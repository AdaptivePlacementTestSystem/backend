import { PrismaClient } from '@prisma/client';
import { ensureRootAdmin } from './root-admin';

/**
 * Tạo Admin gốc: `npm run db:seed:admin`.
 * Biến môi trường (đọc từ `.env` nếu có):
 *   ROOT_ADMIN_EMAIL      email đăng nhập của Admin gốc (bắt buộc)
 *   SEED_ADMIN_PASSWORD   mật khẩu ban đầu, bắt buộc đổi ở lần đăng nhập đầu (bắt buộc)
 *   ROOT_ADMIN_FULL_NAME  họ tên hiển thị (tùy chọn)
 */
try {
  process.loadEnvFile('.env');
} catch {
  // Không có .env: dùng biến môi trường của tiến trình.
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const result = await ensureRootAdmin(prisma, {
    email: process.env.ROOT_ADMIN_EMAIL,
    password: process.env.SEED_ADMIN_PASSWORD,
    fullName: process.env.ROOT_ADMIN_FULL_NAME,
  });
  console.log(
    result === 'CREATED'
      ? `Đã tạo Admin gốc ${process.env.ROOT_ADMIN_EMAIL?.trim().toLowerCase()} (bắt buộc đổi mật khẩu ở lần đăng nhập đầu).`
      : 'Admin gốc đã tồn tại, không thay đổi gì.',
  );
}

main()
  .catch((error: unknown) => {
    console.error(
      `Không tạo được Admin gốc: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
