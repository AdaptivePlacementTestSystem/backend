-- Add batch-level audit action for deadline changes decided 2026-11-26.
ALTER TYPE "ReviewAction" ADD VALUE IF NOT EXISTS 'UPDATE_DUE_DATE';
