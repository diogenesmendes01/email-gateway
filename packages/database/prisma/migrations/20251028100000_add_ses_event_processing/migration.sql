-- TASK-024: Add SES Event Processing Support
-- This migration adds:
-- 1. SES event fields to email_logs (bounce_type, bounce_subtype, complaint_feedback_type, delivery_timestamp)
-- 2. recipient_blocklist table for hard bounces and spam complaints

-- Add SES event fields to email_logs
ALTER TABLE "email_logs" ADD COLUMN "bounce_type" VARCHAR(32);
ALTER TABLE "email_logs" ADD COLUMN "bounce_subtype" VARCHAR(64);
ALTER TABLE "email_logs" ADD COLUMN "complaint_feedback_type" VARCHAR(64);
ALTER TABLE "email_logs" ADD COLUMN "delivery_timestamp" TIMESTAMP(3);

-- Create recipient_blocklist table
CREATE TABLE "recipient_blocklist" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "bounce_type" VARCHAR(32),
    "bounce_subtype" VARCHAR(64),
    "ses_message_id" VARCHAR(128),
    "blocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "recipient_blocklist_pkey" PRIMARY KEY ("id")
);

-- Create unique index for company + email (prevent duplicates)
CREATE UNIQUE INDEX "idx_blocklist_company_email" ON "recipient_blocklist"("company_id", "email");

-- Create index for querying by reason and date
CREATE INDEX "idx_blocklist_reason" ON "recipient_blocklist"("reason", "blocked_at");

-- Add foreign key constraint
ALTER TABLE "recipient_blocklist" ADD CONSTRAINT "recipient_blocklist_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add comments for documentation
COMMENT ON TABLE "recipient_blocklist" IS 'TASK-024: Emails blocked due to hard bounces or spam complaints to protect sender reputation';
COMMENT ON COLUMN "email_logs"."bounce_type" IS 'TASK-024: SES bounce type (Permanent, Temporary, Transient)';
COMMENT ON COLUMN "email_logs"."complaint_feedback_type" IS 'TASK-024: SES complaint feedback type (abuse, fraud, etc)';
COMMENT ON COLUMN "email_logs"."delivery_timestamp" IS 'TASK-024: Timestamp when SES confirmed email delivery';
