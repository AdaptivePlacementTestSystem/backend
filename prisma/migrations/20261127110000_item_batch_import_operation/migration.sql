ALTER TABLE "item_batches" ADD COLUMN "import_operation_id" UUID;
CREATE UNIQUE INDEX "item_batches_import_operation_id_key" ON "item_batches"("import_operation_id");
