# Hợp đồng OpenAPI

Chạy `npm run openapi:generate` để tái sinh `openapi.json` và inventory từ các controller đã build. CI đối chiếu hai tệp đã commit, kiểm tra coverage và các thay đổi có thể phá hợp đồng.

Endpoint chưa hoàn thiện contract được khai báo trong `openapi-coverage-debt.json` bằng object `{ "method": "GET", "path": "/api/v1/...", "reason": "..." }`. CI từ chối endpoint thiếu khai báo, nợ trùng, thiếu lý do và nợ đã lỗi thời. Khi hoàn thiện contract, xóa mục nợ tương ứng và tái sinh snapshot. Danh sách ban đầu rỗng. Mỗi endpoint bổ sung vẫn cần review DTO, quyền và hành vi runtime; xuất hiện trong Swagger không chứng minh contract đúng.

Nền develop chưa có API quản trị kỳ thi, vì vậy hai operation GET/POST `/exam-rounds` phải được bổ sung cùng tính năng đó. GET `/items` trên nền hiện tại trả mảng; không mô tả phân trang cho đến khi runtime phân trang được tích hợp và kiểm thử.
