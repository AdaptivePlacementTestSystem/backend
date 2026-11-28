CREATE TABLE "roster_import_events" (
  "operation_id" UUID NOT NULL,
  "round_id" UUID NOT NULL,
  "admin_id" UUID NOT NULL,
  "added_count" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roster_import_events_pkey" PRIMARY KEY ("operation_id"),
  CONSTRAINT "roster_import_events_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "exam_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "roster_import_events_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "roster_import_events_round_id_created_at_idx" ON "roster_import_events"("round_id", "created_at");
