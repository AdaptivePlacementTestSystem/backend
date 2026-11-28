CREATE TABLE "item_batch_jobs" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "kind" VARCHAR(16) NOT NULL CHECK ("kind" IN ('GENERATE', 'CHECK')),
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'RUNNING', 'DONE', 'FAILED')),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_token" UUID,
  "lease_until" TIMESTAMPTZ(6),
  "last_error" VARCHAR(100),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "item_batch_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "item_batch_jobs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "item_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "item_batch_jobs_batch_id_kind_key" UNIQUE ("batch_id", "kind"),
  CONSTRAINT "item_batch_jobs_lease_check" CHECK (("status" = 'RUNNING' AND "lease_token" IS NOT NULL AND "lease_until" IS NOT NULL) OR ("status" <> 'RUNNING' AND "lease_token" IS NULL AND "lease_until" IS NULL))
);
CREATE INDEX "item_batch_jobs_status_available_at_idx" ON "item_batch_jobs"("status", "available_at");
