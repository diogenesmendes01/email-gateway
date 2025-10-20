-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'ENQUEUED', 'RECEIVED', 'VALIDATED', 'SENT_ATTEMPT', 'SENT', 'FAILED', 'RETRYING', 'RETRY_SCHEDULED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CREATED', 'ENQUEUED', 'RECEIVED', 'VALIDATED', 'SENT_ATTEMPT', 'PROCESSING', 'SENT', 'FAILED', 'RETRYING', 'RETRY_SCHEDULED', 'BOUNCED', 'COMPLAINED', 'DELIVERED', 'VALIDATION_FAILED');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipients" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "external_id" TEXT,
    "cpf_cnpj_hash" VARCHAR(64),
    "cpf_cnpj_enc" TEXT,
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

-- CreateIndex
CREATE UNIQUE INDEX "companies_api_key_key" ON "companies"("api_key");

-- CreateIndex
CREATE UNIQUE INDEX "companies_api_key_hash_key" ON "companies"("api_key_hash");

-- CreateIndex
CREATE INDEX "recipients_company_id_cpf_cnpj_hash_idx" ON "recipients"("company_id", "cpf_cnpj_hash");

-- CreateIndex
CREATE INDEX "recipients_company_id_email_idx" ON "recipients"("company_id", "email");

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

-- AddForeignKey
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

