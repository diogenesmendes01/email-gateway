-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'ENQUEUED', 'RECEIVED', 'VALIDATED', 'SENT_ATTEMPT', 'SENT', 'FAILED', 'RETRYING', 'RETRY_SCHEDULED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CREATED', 'ENQUEUED', 'RECEIVED', 'VALIDATED', 'SENT_ATTEMPT', 'PROCESSING', 'SENT', 'FAILED', 'RETRYING', 'RETRY_SCHEDULED', 'BOUNCED', 'COMPLAINED', 'DELIVERED', 'VALIDATION_FAILED');

-- CreateEnum
CREATE TYPE "DomainVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'TEMPORARY_FAILURE');

-- CreateEnum
CREATE TYPE "DKIMVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(128) NOT NULL,
    "api_key" TEXT NOT NULL,
    "api_key_hash" VARCHAR(128) NOT NULL,
    "api_key_prefix" VARCHAR(20) NOT NULL,
    "api_key_created_at" TIMESTAMP(3) NOT NULL,
    "api_key_expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "allowed_ips" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rate_limit_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "default_from_address" VARCHAR(254),
    "default_from_name" VARCHAR(100),
    "domain_id" TEXT,
    "daily_email_limit" INTEGER NOT NULL DEFAULT 1000,
    "monthly_email_limit" INTEGER,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspension_reason" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" VARCHAR(128),
    "bounce_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "complaint_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_metrics_update" TIMESTAMP(3),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipients" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "external_id" TEXT,
    "cpf_cnpj_hash" VARCHAR(64),
    "cpf_cnpj_enc" TEXT,
    "cpf_cnpj_salt" TEXT,
    "razao_social" VARCHAR(150),
    "nome" VARCHAR(120),
    "email" VARCHAR(254) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "recipient_id" TEXT,
    "external_id" VARCHAR(64),
    "to" VARCHAR(254) NOT NULL,
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" VARCHAR(150) NOT NULL,
    "html" TEXT NOT NULL,
    "reply_to" VARCHAR(254),
    "headers" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "job_id" TEXT,
    "request_id" VARCHAR(128),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "enqueued_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "batch_id" TEXT,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "outbox_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "recipient_id" TEXT,
    "to" VARCHAR(254) NOT NULL,
    "subject" VARCHAR(150) NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "ses_message_id" VARCHAR(128),
    "error_code" VARCHAR(64),
    "error_reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "request_id" VARCHAR(128),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "bounce_type" VARCHAR(32),
    "bounce_subtype" VARCHAR(64),
    "complaint_feedback_type" VARCHAR(64),
    "delivery_timestamp" TIMESTAMP(3),

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" TEXT NOT NULL,
    "email_log_id" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "outbox_id" TEXT NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" VARCHAR(128),
    "action" VARCHAR(64) NOT NULL,
    "resource" VARCHAR(64) NOT NULL,
    "resource_id" VARCHAR(128),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "domain" VARCHAR(253) NOT NULL,
    "status" "DomainVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "dkimStatus" "DKIMVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "dkim_tokens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "spf_record" VARCHAR(255),
    "dkim_records" JSONB,
    "dmarc_record" VARCHAR(255),
    "last_checked" TIMESTAMP(3),
    "last_verified" TIMESTAMP(3),
    "error_message" TEXT,
    "warmup_enabled" BOOLEAN NOT NULL DEFAULT false,
    "warmup_start_date" TIMESTAMP(3),
    "warmup_config" JSONB,
    "is_production_ready" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "secret" VARCHAR(64) NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "response_code" INTEGER,
    "response_body" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE UNIQUE INDEX "companies_email_key" ON "companies"("email");

-- CreateIndex
CREATE UNIQUE INDEX "companies_api_key_key" ON "companies"("api_key");

-- CreateIndex
CREATE UNIQUE INDEX "companies_api_key_hash_key" ON "companies"("api_key_hash");

-- CreateIndex
CREATE INDEX "idx_companies_approval_status" ON "companies"("is_approved", "is_suspended");

-- CreateIndex
CREATE INDEX "idx_companies_bounce_rate" ON "companies"("bounce_rate");

-- CreateIndex
CREATE INDEX "idx_companies_complaint_rate" ON "companies"("complaint_rate");

-- CreateIndex
CREATE INDEX "idx_companies_domain_id" ON "companies"("domain_id");

-- CreateIndex
CREATE INDEX "recipients_company_id_cpf_cnpj_hash_deleted_at_idx" ON "recipients"("company_id", "cpf_cnpj_hash", "deleted_at");

-- CreateIndex
CREATE INDEX "recipients_company_id_email_deleted_at_idx" ON "recipients"("company_id", "email", "deleted_at");

-- CreateIndex
CREATE INDEX "recipients_company_id_deleted_at_created_at_idx" ON "recipients"("company_id", "deleted_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "recipients_company_id_external_id_key" ON "recipients"("company_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_outbox_job_id_key" ON "email_outbox"("job_id");

-- CreateIndex
CREATE INDEX "email_outbox_company_id_status_idx" ON "email_outbox"("company_id", "status");

-- CreateIndex
CREATE INDEX "email_outbox_company_id_external_id_idx" ON "email_outbox"("company_id", "external_id");

-- CreateIndex
CREATE INDEX "email_outbox_company_id_created_at_idx" ON "email_outbox"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "email_outbox_recipient_id_idx" ON "email_outbox"("recipient_id");

-- CreateIndex
CREATE INDEX "idx_email_outbox_batch" ON "email_outbox"("batch_id");

-- CreateIndex
CREATE INDEX "idx_email_outbox_dashboard" ON "email_outbox"("company_id", "status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_outbox_id_key" ON "email_logs"("outbox_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_ses_message_id_key" ON "email_logs"("ses_message_id");

-- CreateIndex
CREATE INDEX "email_logs_company_id_status_idx" ON "email_logs"("company_id", "status");

-- CreateIndex
CREATE INDEX "email_logs_company_id_created_at_idx" ON "email_logs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "email_logs_recipient_id_idx" ON "email_logs"("recipient_id");

-- CreateIndex
CREATE INDEX "email_logs_ses_message_id_idx" ON "email_logs"("ses_message_id");

-- CreateIndex
CREATE INDEX "email_logs_status_created_at_idx" ON "email_logs"("status", "created_at");

-- CreateIndex
CREATE INDEX "email_logs_sent_at_idx" ON "email_logs"("sent_at");

-- CreateIndex
CREATE INDEX "email_logs_attempts_created_at_idx" ON "email_logs"("attempts", "created_at");

-- CreateIndex
CREATE INDEX "email_logs_duration_ms_idx" ON "email_logs"("duration_ms");

-- CreateIndex
CREATE INDEX "email_events_email_log_id_created_at_idx" ON "email_events"("email_log_id", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_company_id_key_key" ON "idempotency_keys"("company_id", "key");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resource_id_idx" ON "audit_logs"("resource", "resource_id");

-- CreateIndex
CREATE INDEX "domains_company_id_status_idx" ON "domains"("company_id", "status");

-- CreateIndex
CREATE INDEX "domains_domain_idx" ON "domains"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "domains_company_id_domain_key" ON "domains"("company_id", "domain");

-- CreateIndex
CREATE INDEX "idx_webhooks_company_active" ON "webhooks"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "idx_webhook_deliveries_webhook" ON "webhook_deliveries"("webhook_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_webhook_deliveries_status" ON "webhook_deliveries"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "idx_blocklist_reason" ON "recipient_blocklist"("reason", "blocked_at");

-- CreateIndex
CREATE UNIQUE INDEX "idx_blocklist_company_email" ON "recipient_blocklist"("company_id", "email");

-- CreateIndex
CREATE INDEX "idx_email_batches_company" ON "email_batches"("company_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_email_batches_status" ON "email_batches"("status", "created_at");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "email_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_outbox_id_fkey" FOREIGN KEY ("outbox_id") REFERENCES "email_outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_email_log_id_fkey" FOREIGN KEY ("email_log_id") REFERENCES "email_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipient_blocklist" ADD CONSTRAINT "recipient_blocklist_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_batches" ADD CONSTRAINT "email_batches_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
