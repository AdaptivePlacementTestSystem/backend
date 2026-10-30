-- ==============================================================================
-- SQL Migration: Partial Indexes & Check Constraints (SRS v3.0)
-- Tài liệu tham chiếu: SRS_TLCN_v3.0.md Mục 6.2 & 6.2b, schema.prisma
-- ==============================================================================

-- 1. Partial Index phục vụ CAT Engine item selection (< 20ms) (Mục 6.2, R9, DC-39)
-- Đảm bảo chỉ item FINAL_APPROVED mới được chọn vào bài thi thích ứng
CREATE INDEX IF NOT EXISTS idx_items_cat ON items (status, skill, irt_b) WHERE status = 'FINAL_APPROVED';

-- Chỉ mục băm content_hash phục vụ lọc trùng T1 (Mục 6.2, DC-30)
CREATE INDEX IF NOT EXISTS idx_items_content_hash ON items (content_hash);

-- 2. Ràng buộc toàn vẹn dữ liệu bảng items
ALTER TABLE items
  DROP CONSTRAINT IF EXISTS chk_items_correct_answer,
  ADD CONSTRAINT chk_items_correct_answer CHECK (correct_answer IN ('A','B','C','D'));

-- FINAL_APPROVED phải có approved_by và approved_at
ALTER TABLE items
  DROP CONSTRAINT IF EXISTS chk_items_approved_has_approver,
  ADD CONSTRAINT chk_items_approved_has_approver
    CHECK (status <> 'FINAL_APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL));

ALTER TABLE items
  DROP CONSTRAINT IF EXISTS chk_items_irt_a_positive,
  ADD CONSTRAINT chk_items_irt_a_positive CHECK (irt_a > 0);

ALTER TABLE items
  DROP CONSTRAINT IF EXISTS chk_items_times_used_nonneg,
  ADD CONSTRAINT chk_items_times_used_nonneg CHECK (times_used >= 0);

-- 3. Ràng buộc toàn vẹn bảng exam_rounds (Mục 6.2b, DC-24)
ALTER TABLE exam_rounds
  DROP CONSTRAINT IF EXISTS ck_exam_round_window,
  ADD CONSTRAINT ck_exam_round_window CHECK (closes_at > opens_at);

ALTER TABLE exam_rounds
  DROP CONSTRAINT IF EXISTS ck_exam_round_duration,
  ADD CONSTRAINT ck_exam_round_duration CHECK (duration_minutes BETWEEN 5 AND 180);

-- 4. Ràng buộc bảng phân công duyệt lô item_batch_assignments (schema.prisma line 78)
ALTER TABLE item_batch_assignments
  DROP CONSTRAINT IF EXISTS ck_batch_assignment_days,
  ADD CONSTRAINT ck_batch_assignment_days CHECK (review_days >= 1 AND confirm_days >= 1);

-- 5. Ràng buộc 1 phiên thi/kỳ/SV, trừ phiên ABANDONED (DC-08, Mục 6.2b)
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_round_student
  ON test_sessions (exam_round_id, student_id)
  WHERE status <> 'ABANDONED';

-- 6. Ràng buộc phân quyền và thông tin đăng nhập bảng users
-- DC-19: hệ thống đơn trường, không còn institution_id
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_institution_required;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_users_auth_credentials,
  ADD CONSTRAINT chk_users_auth_credentials
    CHECK (auth_provider IS NULL
        OR (auth_provider = 'LOCAL' AND password_hash IS NOT NULL)
        OR (auth_provider <> 'LOCAL' AND external_id IS NOT NULL));

-- 7. Ràng buộc câu trả lời bảng session_responses
ALTER TABLE session_responses
  DROP CONSTRAINT IF EXISTS chk_response_option,
  ADD CONSTRAINT chk_response_option CHECK (response IN ('A','B','C','D'));
