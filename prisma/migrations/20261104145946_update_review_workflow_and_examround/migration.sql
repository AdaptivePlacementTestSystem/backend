/*
  Warnings:

  - The values [EXTEND,FORCE_SEND] on the enum `ReviewAction` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `package_id` on the `item_review_events` table. All the data in the column will be lost.
  - You are about to drop the column `original_snapshot` on the `items` table. All the data in the column will be lost.
  - You are about to drop the column `package_id` on the `items` table. All the data in the column will be lost.
  - You are about to drop the `item_batch_assignments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `item_packages` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `item_review_assignments` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ReviewAction_new" AS ENUM ('APPROVE', 'REJECT', 'CONFIRM', 'REMOVE', 'CONFIRM_ALL', 'IMPORT', 'ASSIGN', 'REASSIGN', 'ACCEPT_FLAG');
ALTER TABLE "item_review_events" ALTER COLUMN "action" TYPE "ReviewAction_new" USING ("action"::text::"ReviewAction_new");
ALTER TYPE "ReviewAction" RENAME TO "ReviewAction_old";
ALTER TYPE "ReviewAction_new" RENAME TO "ReviewAction";
DROP TYPE "ReviewAction_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "item_batch_assignments" DROP CONSTRAINT "item_batch_assignments_assigned_by_fkey";

-- DropForeignKey
ALTER TABLE "item_batch_assignments" DROP CONSTRAINT "item_batch_assignments_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "item_batch_assignments" DROP CONSTRAINT "item_batch_assignments_confirmer_id_fkey";

-- DropForeignKey
ALTER TABLE "item_packages" DROP CONSTRAINT "item_packages_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "item_packages" DROP CONSTRAINT "item_packages_confirmer_id_fkey";

-- DropForeignKey
ALTER TABLE "item_packages" DROP CONSTRAINT "item_packages_reviewer_id_fkey";

-- DropForeignKey
ALTER TABLE "item_review_assignments" DROP CONSTRAINT "item_review_assignments_assignee_id_fkey";

-- DropForeignKey
ALTER TABLE "item_review_assignments" DROP CONSTRAINT "item_review_assignments_item_id_fkey";

-- DropForeignKey
ALTER TABLE "items" DROP CONSTRAINT "items_package_id_fkey";

-- DropIndex
DROP INDEX "idx_items_content_hash";

-- DropIndex
DROP INDEX "items_package_id_idx";

-- AlterTable
ALTER TABLE "item_review_events" DROP COLUMN "package_id";

-- AlterTable
ALTER TABLE "items" DROP COLUMN "original_snapshot",
DROP COLUMN "package_id",
ADD COLUMN     "confirmer_id" UUID,
ADD COLUMN     "first_reminder_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "first_review" JSONB,
ADD COLUMN     "reviewer_id" UUID,
ADD COLUMN     "second_reminder_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "second_review" JSONB;

-- DropTable
DROP TABLE "item_batch_assignments";

-- DropTable
DROP TABLE "item_packages";

-- DropTable
DROP TABLE "item_review_assignments";

-- DropEnum
DROP TYPE "PackageStatus";

-- CreateIndex
CREATE INDEX "items_reviewer_id_status_idx" ON "items"("reviewer_id", "status");

-- CreateIndex
CREATE INDEX "items_confirmer_id_status_idx" ON "items"("confirmer_id", "status");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_confirmer_id_fkey" FOREIGN KEY ("confirmer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
