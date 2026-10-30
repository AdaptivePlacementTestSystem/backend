-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN', 'EDUZ_SERVICE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "StoppingReason" AS ENUM ('MAX_ITEMS_REACHED', 'SE_THRESHOLD', 'ITEM_BANK_BOUNDARY', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "CEFRLevel" AS ENUM ('PRE_A1', 'A1', 'A2', 'B1', 'B2', 'C1_PLUS');

-- CreateEnum
CREATE TYPE "CEFRConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "Skill" AS ENUM ('VOCABULARY', 'GRAMMAR');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('DRAFT', 'FIRST_APPROVED', 'SECOND_APPROVED', 'FINAL_APPROVED', 'REJECTED', 'AI_REJECTED');

-- CreateEnum
CREATE TYPE "ItemBatchSource" AS ENUM ('AI_GENERATED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "ItemBatchStatus" AS ENUM ('GENERATING', 'IMPORTING', 'CHECKING', 'READY_TO_ASSIGN', 'IN_REVIEW', 'READY_TO_FINALIZE', 'FINAL_CHECKED', 'DONE', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('OPEN', 'SENT', 'DONE');

-- CreateEnum
CREATE TYPE "CheckPoint" AS ENUM ('C1', 'C2', 'C3');

-- CreateEnum
CREATE TYPE "CheckLevel" AS ENUM ('PASS', 'SOFT', 'HARD');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('APPROVE', 'REJECT', 'CONFIRM', 'REMOVE', 'CONFIRM_ALL', 'IMPORT', 'REASSIGN', 'EXTEND', 'FORCE_SEND', 'ACCEPT_FLAG');

-- CreateEnum
CREATE TYPE "ExamRoundStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "AuthProviderType" AS ENUM ('LOCAL', 'GOOGLE', 'MICROSOFT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT,
    "auth_provider" "AuthProviderType",
    "external_id" TEXT,
    "full_name" VARCHAR(200) NOT NULL,
    "role" "UserRole" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "password_changed_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "user_id" UUID NOT NULL,
    "student_code" VARCHAR(50) NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "user_id" UUID NOT NULL,
    "teacher_code" VARCHAR(50) NOT NULL,

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correct_answer" CHAR(1) NOT NULL,
    "skill" "Skill" NOT NULL,
    "topic_tag" VARCHAR(50),
    "cefr_target" "CEFRLevel" NOT NULL,
    "irt_b" DOUBLE PRECISION NOT NULL,
    "irt_a" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "irt_c" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
    "status" "ItemStatus" NOT NULL DEFAULT 'DRAFT',
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "times_used" INTEGER NOT NULL DEFAULT 0,
    "calibrated" BOOLEAN NOT NULL DEFAULT false,
    "content_hash" VARCHAR(64),
    "batch_id" UUID NOT NULL,
    "package_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "explanations" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explanations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_batches" (
    "id" UUID NOT NULL,
    "source" "ItemBatchSource" NOT NULL,
    "name" VARCHAR(100),
    "created_by" UUID NOT NULL,
    "skill" "Skill",
    "cefr_target" "CEFRLevel",
    "topic_tag" VARCHAR(50),
    "requested_count" INTEGER,
    "status" "ItemBatchStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "item_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_batch_assignments" (
    "batch_id" UUID NOT NULL,
    "confirmer_id" UUID NOT NULL,
    "assigned_by" UUID NOT NULL,
    "review_days" INTEGER NOT NULL,
    "confirm_days" INTEGER NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_batch_assignments_pkey" PRIMARY KEY ("batch_id")
);

-- CreateTable
CREATE TABLE "item_review_assignments" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "assignee_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "reminder_sent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "item_review_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_packages" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "confirmer_id" UUID NOT NULL,
    "status" "PackageStatus" NOT NULL DEFAULT 'OPEN',
    "sent_at" TIMESTAMPTZ(6),
    "due_at" TIMESTAMPTZ(6),
    "reminder_sent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "item_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_embeddings" (
    "item_id" UUID NOT NULL,
    "vector" DOUBLE PRECISION[],
    "model" VARCHAR(100) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_embeddings_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "item_check_results" (
    "id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "checkpoint" "CheckPoint" NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "level" "CheckLevel" NOT NULL,
    "reason_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suspected_duplicate_id" UUID,
    "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_check_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_review_events" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "item_id" UUID,
    "package_id" UUID,
    "actor_id" UUID NOT NULL,
    "action" "ReviewAction" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_review_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_rounds" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "created_by" UUID NOT NULL,
    "opens_at" TIMESTAMPTZ(6) NOT NULL,
    "closes_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 45,
    "status" "ExamRoundStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exam_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_round_participants" (
    "round_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "note" VARCHAR(255),
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_round_participants_pkey" PRIMARY KEY ("round_id","student_id")
);

-- CreateTable
CREATE TABLE "test_sessions" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "exam_round_id" UUID NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "theta_final" DOUBLE PRECISION,
    "se_final" DOUBLE PRECISION,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "stopping_reason" "StoppingReason",
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "test_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_responses" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "response" CHAR(1) NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "theta_after" DOUBLE PRECISION NOT NULL,
    "se_after" DOUBLE PRECISION NOT NULL,
    "response_time_ms" INTEGER,
    "answered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "language_profiles" (
    "id" UUID NOT NULL,
    "schema_version" VARCHAR(10) NOT NULL DEFAULT '1.0',
    "student_id" UUID NOT NULL,
    "test_session_id" UUID NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL,
    "theta" DOUBLE PRECISION NOT NULL,
    "standard_error" DOUBLE PRECISION NOT NULL,
    "confidence_interval_95" DOUBLE PRECISION[],
    "cefr_level" "CEFRLevel" NOT NULL,
    "cefr_confidence" "CEFRConfidence" NOT NULL,
    "boundary_effect" BOOLEAN NOT NULL DEFAULT false,
    "skill_profiles" JSONB NOT NULL,
    "error_patterns" JSONB NOT NULL DEFAULT '[]',
    "test_metadata" JSONB NOT NULL,
    "ai_recommendations" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "language_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_provider_external" ON "users"("auth_provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_student_code_key" ON "student_profiles"("student_code");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_teacher_code_key" ON "teacher_profiles"("teacher_code");

-- CreateIndex
CREATE INDEX "items_batch_id_status_idx" ON "items"("batch_id", "status");

-- CreateIndex
CREATE INDEX "items_package_id_idx" ON "items"("package_id");

-- CreateIndex
CREATE UNIQUE INDEX "explanations_item_id_key" ON "explanations"("item_id");

-- CreateIndex
CREATE INDEX "item_batches_status_idx" ON "item_batches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "item_review_assignments_item_id_key" ON "item_review_assignments"("item_id");

-- CreateIndex
CREATE INDEX "item_review_assignments_assignee_id_due_at_idx" ON "item_review_assignments"("assignee_id", "due_at");

-- CreateIndex
CREATE INDEX "item_packages_confirmer_id_status_idx" ON "item_packages"("confirmer_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_package_batch_reviewer" ON "item_packages"("batch_id", "reviewer_id");

-- CreateIndex
CREATE INDEX "item_check_results_item_id_checkpoint_checked_at_idx" ON "item_check_results"("item_id", "checkpoint", "checked_at" DESC);

-- CreateIndex
CREATE INDEX "item_review_events_batch_id_created_at_idx" ON "item_review_events"("batch_id", "created_at");

-- CreateIndex
CREATE INDEX "exam_rounds_status_idx" ON "exam_rounds"("status");

-- CreateIndex
CREATE INDEX "exam_round_participants_student_id_idx" ON "exam_round_participants"("student_id");

-- CreateIndex
CREATE INDEX "test_sessions_student_id_started_at_idx" ON "test_sessions"("student_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "test_sessions_exam_round_id_status_idx" ON "test_sessions"("exam_round_id", "status");

-- CreateIndex
CREATE INDEX "session_responses_session_id_answered_at_idx" ON "session_responses"("session_id", "answered_at");

-- CreateIndex
CREATE INDEX "session_responses_item_id_idx" ON "session_responses"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_session_item" ON "session_responses"("session_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "language_profiles_test_session_id_key" ON "language_profiles"("test_session_id");

-- CreateIndex
CREATE INDEX "language_profiles_cefr_level_idx" ON "language_profiles"("cefr_level");

-- CreateIndex
CREATE INDEX "language_profiles_student_id_completed_at_idx" ON "language_profiles"("student_id", "completed_at" DESC);

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "item_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "item_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "explanations" ADD CONSTRAINT "explanations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_batch_assignments" ADD CONSTRAINT "item_batch_assignments_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "item_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_batch_assignments" ADD CONSTRAINT "item_batch_assignments_confirmer_id_fkey" FOREIGN KEY ("confirmer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_batch_assignments" ADD CONSTRAINT "item_batch_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_review_assignments" ADD CONSTRAINT "item_review_assignments_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_review_assignments" ADD CONSTRAINT "item_review_assignments_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_packages" ADD CONSTRAINT "item_packages_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "item_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_packages" ADD CONSTRAINT "item_packages_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_packages" ADD CONSTRAINT "item_packages_confirmer_id_fkey" FOREIGN KEY ("confirmer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_embeddings" ADD CONSTRAINT "item_embeddings_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_check_results" ADD CONSTRAINT "item_check_results_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_check_results" ADD CONSTRAINT "item_check_results_suspected_duplicate_id_fkey" FOREIGN KEY ("suspected_duplicate_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_review_events" ADD CONSTRAINT "item_review_events_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "item_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_review_events" ADD CONSTRAINT "item_review_events_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_review_events" ADD CONSTRAINT "item_review_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_rounds" ADD CONSTRAINT "exam_rounds_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_round_participants" ADD CONSTRAINT "exam_round_participants_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "exam_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_round_participants" ADD CONSTRAINT "exam_round_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_exam_round_id_student_id_fkey" FOREIGN KEY ("exam_round_id", "student_id") REFERENCES "exam_round_participants"("round_id", "student_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_exam_round_id_fkey" FOREIGN KEY ("exam_round_id") REFERENCES "exam_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_responses" ADD CONSTRAINT "session_responses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "test_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_responses" ADD CONSTRAINT "session_responses_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "language_profiles" ADD CONSTRAINT "language_profiles_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "language_profiles" ADD CONSTRAINT "language_profiles_test_session_id_fkey" FOREIGN KEY ("test_session_id") REFERENCES "test_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ==============================================================================
-- Custom Migrations: Partial Indexes & Check Constraints (SRS v3.0)
-- ==============================================================================
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
