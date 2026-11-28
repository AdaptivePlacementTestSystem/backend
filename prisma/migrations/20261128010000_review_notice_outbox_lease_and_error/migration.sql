-- Extend review_notice_outbox (migration #16) with operational lease, error tracking, and sent timestamp
-- matching Decision #14 (28/11/2026) while remaining backward compatible with existing columns.
ALTER TABLE "review_notice_outbox"
  ADD COLUMN "lease_token" UUID,
  ADD COLUMN "lease_until" TIMESTAMPTZ(6),
  ADD COLUMN "last_error" VARCHAR(200),
  ADD COLUMN "sent_at" TIMESTAMPTZ(6);

-- Drop existing status CHECK constraint dynamically (avoid PostgreSQL auto-generated name differences).
DO $$
DECLARE
  c_name TEXT;
BEGIN
  FOR c_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'review_notice_outbox'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE "review_notice_outbox" DROP CONSTRAINT %I', c_name);
  END LOOP;
END $$;

ALTER TABLE "review_notice_outbox"
  ADD CONSTRAINT "review_notice_outbox_status_check"
    CHECK ("status" IN ('PENDING', 'PROCESSING', 'SENT', 'CANCELLED', 'DEAD')),
  ADD CONSTRAINT "review_notice_outbox_lease_check"
    CHECK (
      ("status" = 'PROCESSING' AND "lease_token" IS NOT NULL AND "lease_until" IS NOT NULL)
      OR ("status" <> 'PROCESSING' AND "lease_token" IS NULL AND "lease_until" IS NULL)
    );
