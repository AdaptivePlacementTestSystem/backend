ALTER TABLE "items" ADD COLUMN "generated_from_ref_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
