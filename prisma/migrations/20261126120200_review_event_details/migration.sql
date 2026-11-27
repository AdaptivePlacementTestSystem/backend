-- Store batch-level audit details such as CONFIRM_ALL and UPDATE_DUE_DATE.
ALTER TABLE "item_review_events" ADD COLUMN "details" JSONB;
