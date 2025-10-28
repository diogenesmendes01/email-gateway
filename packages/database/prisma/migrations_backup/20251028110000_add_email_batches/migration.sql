-- TASK-025: Add Email Batch Support
-- This migration adds:
-- 1. BatchStatus enum
-- 2. email_batches table for tracking batch campaigns
-- 3. batch_id field in email_outbox table

-- Create BatchStatus enum
CREATE TYPE "BatchStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- Create email_batches table
CREATE TABLE "email_batches" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'PROCESSING',
    "total_emails" INTEGER NOT NULL,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "email_batches_pkey" PRIMARY KEY ("id")
);

-- Add batch_id column to email_outbox
ALTER TABLE "email_outbox" ADD COLUMN "batch_id" TEXT;

-- Create indexes for performance
CREATE INDEX "idx_email_batches_company" ON "email_batches"("company_id", "created_at" DESC);
CREATE INDEX "idx_email_batches_status" ON "email_batches"("status", "created_at");
CREATE INDEX "idx_email_outbox_batch" ON "email_outbox"("batch_id");

-- Add foreign key constraints
ALTER TABLE "email_batches" ADD CONSTRAINT "email_batches_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "email_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add comments for documentation
COMMENT ON TABLE "email_batches" IS 'TASK-025: Tracking for bulk email campaigns (up to 1000 emails per batch)';
COMMENT ON COLUMN "email_batches"."status" IS 'PROCESSING = in progress, COMPLETED = all success, PARTIAL = some failed, FAILED = all failed';
COMMENT ON COLUMN "email_outbox"."batch_id" IS 'TASK-025: Links email to its batch campaign (NULL if sent individually)';
