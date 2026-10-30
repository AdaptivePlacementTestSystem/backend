# Quy ước mã (Backend NestJS)

## Phạm vi & Kiến trúc

- Backend chịu trách nhiệm xử lý toàn bộ nghiệp vụ, logic bảo mật và tính toán CAT (EAP, Fisher Information, Rasch Model, stopping rule, CEFR mapping).
- Tuân thủ Clean Architecture theo từng module (`domain`, `application`, `infrastructure`, `presentation`).
- Domain layer không phụ thuộc trực tiếp vào ORM (Prisma), chỉ giao tiếp thông qua interfaces/repositories.
- Không hardcode các tham số thuật toán CAT (`CAT_*`), bí mật hay cấu hình hệ thống — đọc thông qua `ConfigService`.

## Cấu trúc module

- Mỗi module nghiệp vụ nằm tại `src/modules/<module-name>/`.
- Các thành phần dùng chung (guards, filters, decorators, prisma service) nằm tại `src/shared/`.
- Cấu hình môi trường và validation schema nằm tại `src/config/`.

## Đặt tên và định dạng

- File đặt tên theo định dạng kebab-case với hậu tố tương ứng: `*.service.ts`, `*.controller.ts`, `*.module.ts`, `*.dto.ts`, `*.spec.ts`.
- Class đặt tên theo `PascalCase`; hàm, phương thức và biến theo `camelCase`; hằng số và enum members theo `UPPER_SNAKE_CASE`.
- Định danh bằng tiếng Anh; tài liệu kỹ thuật, commit và chú thích bằng tiếng Việt.
- Định dạng code bằng Prettier (`npm run format`), kiểm tra bằng Prettier (`npm run format:check`) và Oxlint (`npm run lint`).
- Cấu hình TypeScript nghiêm ngặt (`strict: true`).

## Chất lượng & Kiểm thử

- Chạy kiểm tra tĩnh trước khi commit/push: `npm run lint`, `npm run dup`, `npm run typecheck`, `npm run format:check`.
- Tỷ lệ trùng lặp mã nguồn ≤ 3% (`npm run dup` qua `jscpd`).
- Kiểm thử đơn vị bằng Vitest: `npm run test` hoặc `npm run test:cov`.

## Git & Quy trình làm việc

- Nhánh phát triển tuân thủ quy ước: `feat|fix|docs|test|chore|refactor/<ten-viet-thuong-gach-ngang>`.
- Mọi thay đổi vào nhánh `develop` phải thông qua Pull Request, có ít nhất 1 approval và vượt qua các checks tự động.
- Không commit trực tiếp vào `main` và `develop`.
- Không bao giờ commit file bí mật `.env` hoặc chứa credentials vào repository.
