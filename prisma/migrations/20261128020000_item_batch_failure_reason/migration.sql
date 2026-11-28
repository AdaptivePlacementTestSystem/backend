-- Add nullable batch-level failure reason (Decision #15, 28/11/2026),
-- complementing ItemBatchJob.last_error for zero-item AI batches and non-job failures.
ALTER TABLE "item_batches"
  ADD COLUMN "failure_reason" VARCHAR(100);
