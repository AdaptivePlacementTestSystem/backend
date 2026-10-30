# Danh mục nợ kỹ thuật (Backend)

Cập nhật khi phát hiện hoặc xử lý. Mức: 🔴 chặn sử dụng thật · 🟠 nên xử lý sớm · 🟡 cải thiện.

| #   | Mức | Nợ                                                                                            | Hệ quả                                                     | Kế hoạch xử lý                                                         |
| --- | --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | 🟠  | Thư mục `prisma/migrations` chưa có migration khởi tạo ban đầu                                | `prisma migrate deploy` trên staging chưa tạo bảng         | Sinh baseline migration từ `schema.prisma` và `custom_migrations.sql`   |
| 2   | 🟠  | Coverage unit test (~2.8%) còn thấp so với ngưỡng yêu cầu 70% của rubric TC2.5                | Rủi ro hồi quy và chưa đạt mức tối đa TC2.5                | Bổ sung unit test cho các module domain/application theo kế hoạch tuần |
| 3   | 🟡  | Test integration và e2e còn đang ở dạng khung chờ dữ liệu seed                               | Chưa kiểm thử tự động toàn diện đa tầng                    | Bổ sung kịch bản test tích hợp kết nối Postgres & Redis                 |
| 4   | 🟡  | SonarCloud organization/projectKey đang trỏ tới cấu hình tham chiếu                           | Tạm thời chưa đồng bộ lên dashboard SonarCloud riêng       | Cập nhật `sonar-project.properties` và secret khi cấp project mới      |
