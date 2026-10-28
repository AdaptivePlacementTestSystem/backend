## Mô tả
<!-- Thay đổi gì, vì sao. Liên kết F-ID / feature-plan nếu có: tracking/feature-plans/<slug>.md -->

## Checklist (tick hết trước khi merge; không áp dụng thì tick và ghi "N/A: lý do")
- [ ] Tiêu đề PR theo Conventional Commits (`feat: ...`, `fix: ...`, `docs: ...`)
- [ ] Đã đối chiếu thuật toán/công thức với SRS/tài liệu chính thức nếu liên quan CAT/EAP/Rasch
- [ ] Có unit test đi kèm cho logic mới (đặc biệt `cat-engine`)
- [ ] Không có secret/API key hardcode, không commit `.env` thật
- [ ] Đã cập nhật `tracking/AI_USAGE_LOG.md` nếu PR có phần AI sinh (hoặc N/A: không dùng AI)
- [ ] Lint pass, không có issue Blocker/Critical mới
- [ ] Đã ghi `tracking/DECISIONS_LOG.md` nếu PR có quyết định thiết kế mới (hoặc N/A)
