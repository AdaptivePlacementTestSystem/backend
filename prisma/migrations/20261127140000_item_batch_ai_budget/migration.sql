ALTER TABLE "item_batches" ADD COLUMN "ai_call_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "item_batches" ADD COLUMN "ai_call_limit" INTEGER NOT NULL DEFAULT 250;
ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_ai_budget_check" CHECK ("ai_call_limit" = 250 AND "ai_call_count" >= 0 AND "ai_call_count" <= "ai_call_limit");
