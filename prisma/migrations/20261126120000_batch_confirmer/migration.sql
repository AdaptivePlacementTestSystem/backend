-- Add batch-scoped confirmer as the source of truth for one Teacher B per batch.
ALTER TABLE "item_batches" ADD COLUMN "confirmer_id" UUID;

-- Existing active batches must have one unambiguous confirmer; never guess.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "item_batches" b
    JOIN "items" i ON i."batch_id" = b."id"
    WHERE b."status" = 'IN_REVIEW' AND i."confirmer_id" IS NOT NULL
    GROUP BY b."id"
    HAVING COUNT(DISTINCT i."confirmer_id") > 1
  ) THEN
    RAISE EXCEPTION 'Active review batch has multiple legacy confirmers; resolve assignments before migration';
  END IF;
END $$;

UPDATE "item_batches" b
SET "confirmer_id" = (
  SELECT i."confirmer_id" FROM "items" i
  WHERE i."batch_id" = b."id" AND i."confirmer_id" IS NOT NULL
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM "items" i WHERE i."batch_id" = b."id" AND i."confirmer_id" IS NOT NULL
  GROUP BY i."batch_id" HAVING COUNT(DISTINCT i."confirmer_id") = 1
);

ALTER TABLE "item_batches"
  ADD CONSTRAINT "item_batches_confirmer_id_fkey"
  FOREIGN KEY ("confirmer_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "item_batches_confirmer_id_status_idx"
  ON "item_batches"("confirmer_id", "status");
