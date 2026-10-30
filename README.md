# Adaptive Placement Test System — Backend

Hệ thống kiểm tra trình độ thích ứng trên nền tảng Web theo thuật toán CAT-Rasch (Computerized Adaptive Testing) và ước lượng năng lực EAP (Expected A Posteriori).

## 1. Công nghệ sử dụng

- **Runtime & Framework:** Node.js 24, NestJS 12
- **Cơ sở dữ liệu:** PostgreSQL 16 (lưu trữ chính) & Redis 7 (quản lý phiên thi thời gian thực)
- **ORM:** Prisma 6
- **Kiểm thử & Chất lượng:** Vitest, Oxlint, Prettier, jscpd, Gitleaks, CodeQL
- **Gói chia sẻ dùng chung:** `@apt/shared-types` (DTOs, Enums, Error Codes)

## 2. Cấu trúc thư mục

```text
backend/
├── .githooks/                # Git hooks chuẩn hóa commit, checklist, secret scan
├── .github/
│   ├── workflows/            # GitHub Actions CI/CD workflows
│   │   ├── pipeline.yml      # CI pipeline chính (build, test, security, package, deploy)
│   │   ├── codeql.yml        # Phân tích tĩnh bảo mật CodeQL
│   │   ├── rollback.yml      # Rollback container phiên bản trước trên GHCR
│   │   └── devkit-checks.yml # Kiểm tra branch policy, commit message, checklist
│   └── pull_request_template.md
├── src/
│   ├── config/               # Cấu hình môi trường và Joi schema validation
│   ├── modules/              # 14 module chức năng theo Clean Architecture
│   │   ├── auth/             # Xác thực JWT & phân quyền RBAC
│   │   ├── cat-engine/       # Thuật toán CAT (EAP, Fisher Information, stopping rule)
│   │   ├── exam-round/       # Quản lý kỳ thi và đợt thi
│   │   ├── health/           # Health probe (/health) và Readiness probe (/ready)
│   │   ├── item-bank/        # Ngân hàng câu hỏi thích ứng
│   │   ├── item-generation/  # Tự động sinh câu hỏi qua AI LLM
│   │   ├── language-profile/ # Hồ sơ năng lực ngôn ngữ theo CEFR
│   │   ├── llm-gateway/      # Cổng giao tiếp mô hình AI ngôn ngữ lớn
│   │   ├── mail/             # Dịch vụ gửi email thông báo
│   │   ├── reporting/        # Báo cáo kết quả lớp học và kỳ thi
│   │   ├── test-session/     # Quản lý phiên làm bài thích ứng
│   │   ├── user-admin/       # Quản trị người dùng hệ thống
│   │   └── user-import/      # Import người dùng và ngân hàng đề hàng loạt
│   ├── shared/               # Decorators, Filters, Guards, Prisma Client
│   ├── app.module.ts         # Module gốc
│   └── main.ts               # Điểm khởi chạy ứng dụng (prefix: api/v1)
├── test/                     # Integration tests và E2E tests
├── Dockerfile                # Multi-stage Docker build cho container hóa
├── .jscpd.json               # Cấu hình kiểm tra trùng lặp mã (ngưỡng 3%)
├── CODING_CONVENTION.md      # Quy ước lập trình
└── TECH_DEBT.md              # Theo dõi nợ kỹ thuật
```

## 3. Cài đặt & Khởi chạy

### 3.1. Cài đặt môi trường

Sao chép file `.env.example` thành `.env` và cấu hình các biến phù hợp:

```bash
cp .env.example .env
npm install
npx prisma generate
```

### 3.2. Lệnh phát triển & Kiểm thử

```bash
# Khởi chạy chế độ phát triển
npm run start:dev

# Kiểm tra chất lượng mã nguồn
npm run lint          # Kiểm tra lỗi lint qua Oxlint
npm run typecheck     # Kiểm tra kiểu qua TypeScript compiler
npm run format:check  # Kiểm tra định dạng code qua Prettier
npm run dup           # Kiểm tra trùng lặp mã nguồn (ngưỡng <= 3%)

# Kiểm thử
npm run test          # Chạy unit tests
npm run test:cov      # Đo lường độ phủ kiểm thử (coverage)
npm run test:e2e      # Chạy end-to-end tests

# Build ứng dụng
npm run build
```

## 4. Endpoints Giám sát (Monitoring & Health)

- `GET /api/v1/health`: Liveness probe phục vụ Docker container healthcheck và uptime monitoring.
- `GET /api/v1/ready`: Readiness probe kiểm tra kết nối cơ sở dữ liệu PostgreSQL và Redis cache trước khi điều hướng lưu lượng.

## 5. Quy trình CI/CD

Mọi commit và Pull Request đều được kiểm tra tự động qua 6 chặng của pipeline GitHub Actions:
1. **Build & Test:** Kiểm tra compile, linting, trùng lặp mã, typecheck, format, unit test coverage.
2. **Security:** Quét phát hiện lộ lọt bí mật bằng Gitleaks, quét phụ thuộc bằng `npm audit` và `dependency-review`.
3. **Analyze:** Phân tích tĩnh lỗ hổng bảo mật chuyên sâu bằng GitHub CodeQL.
4. **Package:** Đóng gói Docker image và đẩy lên GitHub Packages (GHCR) gắn thẻ theo commit SHA.
5. **Deploy Staging:** Triển khai tự động lên môi trường staging sau khi vượt qua tất cả các chặng kiểm tra.
