CREATE TABLE "review_notice_outbox" (
  "id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "recipient_id" UUID NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'SENT', 'CANCELLED')),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "review_notice_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_notice_outbox_batch_fkey" FOREIGN KEY ("batch_id") REFERENCES "item_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_notice_outbox_recipient_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "review_notice_outbox_status_available_at_idx" ON "review_notice_outbox"("status", "available_at");
