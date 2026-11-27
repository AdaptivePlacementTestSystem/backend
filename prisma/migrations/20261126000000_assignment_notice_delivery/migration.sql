ALTER TABLE "items"
  ADD COLUMN "first_assignment_notice_sent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "second_assignment_notice_sent" BOOLEAN NOT NULL DEFAULT false;
