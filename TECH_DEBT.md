# Danh mục nợ kỹ thuật (Backend)

Cập nhật khi phát hiện hoặc xử lý. Mức: 🔴 chặn sử dụng thật · 🟠 nên xử lý sớm · 🟡 cải thiện.

| #   | Mức | Nợ                                                                                            | Hệ quả                                                     | Kế hoạch xử lý                                                         |
| --- | --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | 🟠  | Thư mục `prisma/migrations` chưa có migration khởi tạo ban đầu                                | `prisma migrate deploy` trên staging chưa tạo bảng         | Sinh baseline migration từ `schema.prisma` và `custom_migrations.sql`   |
| 2   | 🟠  | Coverage unit test (~2.8%) còn thấp so với ngưỡng yêu cầu 70% của rubric TC2.5                | Rủi ro hồi quy và chưa đạt mức tối đa TC2.5                | Bổ sung unit test cho các module domain/application theo kế hoạch tuần |
| 3   | 🟡  | Test integration và e2e còn đang ở dạng khung chờ dữ liệu seed                               | Chưa kiểm thử tự động toàn diện đa tầng                    | Bổ sung kịch bản test tích hợp kết nối Postgres & Redis                 |
| 4   | 🟡  | SonarCloud organization/projectKey đang trỏ tới cấu hình tham chiếu                           | Tạm thời chưa đồng bộ lên dashboard SonarCloud riêng       | Cập nhật `sonar-project.properties` và secret khi cấp project mới      |
| 5   | 🟠  | Gửi email (OTP, mật khẩu tạm) đang gửi ngay trong request, chưa qua hàng đợi BullMQ có retry (DECISIONS_LOG #134, D6) | Mail lỗi chỉ bị log, không tự gửi lại; gửi hàng loạt trong request sẽ chậm/timeout | Đưa vào BullMQ (thay adapter của `IMailPort`); BẮT BUỘC trước khi làm import hàng loạt gửi mật khẩu tạm |
| 6   | 🟡  | Rate-limit fail-open khi Redis lỗi; mỗi service tự mở kết nối Redis riêng (OTP, throttler); `GetProfileUseCase` chưa tách khỏi `AuthController` | Redis sập thì mất giới hạn đăng nhập; nhiều kết nối dư | Cần xác nhận fail-open/fail-closed với nhóm; tách `RedisModule` dùng chung và `GetProfileUseCase` ở đợt sau (D7) |
