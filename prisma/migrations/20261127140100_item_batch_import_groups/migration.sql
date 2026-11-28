ALTER TABLE "item_batches" ADD COLUMN "import_group_id" UUID;
ALTER TABLE "item_batches" ADD COLUMN "import_part" INTEGER;
ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_import_part_check" CHECK (("import_group_id" IS NULL AND "import_part" IS NULL) OR ("import_group_id" IS NOT NULL AND "import_part" IS NOT NULL AND "import_part" >= 1));
CREATE UNIQUE INDEX "item_batches_import_group_id_import_part_key" ON "item_batches"("import_group_id", "import_part");
