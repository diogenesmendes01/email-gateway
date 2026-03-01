-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('POSTAL_SMTP', 'POSTAL_API', 'MAILU_SMTP', 'HARAKA_API', 'CUSTOM_SMTP');

-- CreateEnum
CREATE TYPE "IPPoolType" AS ENUM ('TRANSACTIONAL', 'MARKETING', 'DEDICATED', 'SHARED');

-- CreateEnum
CREATE TYPE "RateLimitScope" AS ENUM ('MX_DOMAIN', 'CUSTOMER_DOMAIN', 'IP_ADDRESS', 'GLOBAL');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('HARD_BOUNCE', 'SOFT_BOUNCE', 'SPAM_COMPLAINT', 'UNSUBSCRIBE', 'ROLE_ACCOUNT', 'BAD_DOMAIN', 'MANUAL');

-- CreateEnum
CREATE TYPE "DomainOnboardingStatus" AS ENUM ('DNS_PENDING', 'DNS_CONFIGURED', 'DKIM_PENDING', 'DKIM_VERIFIED', 'SPF_PENDING', 'SPF_VERIFIED', 'RETURN_PATH_PENDING', 'RETURN_PATH_VERIFIED', 'WARMUP_IN_PROGRESS', 'PRODUCTION_READY', 'FAILED');

-- DropForeignKey
ALTER TABLE "companies" DROP CONSTRAINT "companies_domain_id_fkey";

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "email" VARCHAR(254) NOT NULL,
    "domain" VARCHAR(253),
    "reason" "SuppressionReason" NOT NULL,
    "source" VARCHAR(64),
    "bounce_type" VARCHAR(32),
    "diagnostic_code" TEXT,
    "suppressed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_provider_configs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "provider" "EmailProvider" NOT NULL DEFAULT 'POSTAL_SMTP',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL,
    "ip_pool_id" TEXT,
    "max_per_second" INTEGER,
    "max_per_minute" INTEGER,
    "max_per_hour" INTEGER,
    "max_per_day" INTEGER,
    "sent_today" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "name" VARCHAR(100),
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_pools" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "IPPoolType" NOT NULL,
    "ip_addresses" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "daily_limit" INTEGER,
    "hourly_limit" INTEGER,
    "sent_today" INTEGER NOT NULL DEFAULT 0,
    "reputation" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "warmup_enabled" BOOLEAN NOT NULL DEFAULT false,
    "warmup_config" JSONB,
    "rbl_listed" BOOLEAN NOT NULL DEFAULT false,
    "rbl_last_check" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ip_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "scope" "RateLimitScope" NOT NULL,
    "target" VARCHAR(253) NOT NULL,
    "per_minute" INTEGER,
    "per_hour" INTEGER,
    "per_day" INTEGER,
    "last_minute" INTEGER NOT NULL DEFAULT 0,
    "last_hour" INTEGER NOT NULL DEFAULT 0,
    "last_day" INTEGER NOT NULL DEFAULT 0,
    "last_reset" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dns_records" (
    "id" TEXT NOT NULL,
    "domain_id" TEXT NOT NULL,
    "recordType" VARCHAR(10) NOT NULL,
    "name" VARCHAR(253) NOT NULL,
    "value" TEXT NOT NULL,
    "priority" INTEGER,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "last_checked" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dns_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_onboarding" (
    "id" TEXT NOT NULL,
    "domain_id" TEXT NOT NULL,
    "status" "DomainOnboardingStatus" NOT NULL DEFAULT 'DNS_PENDING',
    "dkim_generated" BOOLEAN NOT NULL DEFAULT false,
    "dkim_public" TEXT,
    "dkim_private" TEXT,
    "dkim_selector" VARCHAR(63),
    "spf_record" VARCHAR(512),
    "return_path" VARCHAR(253),
    "tracking_domain" VARCHAR(253),
    "last_check_at" TIMESTAMP(3),
    "next_check_at" TIMESTAMP(3),
    "check_attempts" INTEGER NOT NULL DEFAULT 0,
    "ready_for_production" BOOLEAN NOT NULL DEFAULT false,
    "production_approved_at" TIMESTAMP(3),
    "production_approved_by" VARCHAR(128),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_onboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_tracking" (
    "id" TEXT NOT NULL,
    "email_log_id" TEXT NOT NULL,
    "tracking_id" VARCHAR(64) NOT NULL,
    "opened_at" TIMESTAMP(3),
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "clicked_at" TIMESTAMP(3),
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "clicked_urls" JSONB,
    "user_agent" TEXT,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reputation_metrics" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "domain_id" TEXT,
    "ip_pool_id" TEXT,
    "date" DATE NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "bounced" INTEGER NOT NULL DEFAULT 0,
    "bounced_hard" INTEGER NOT NULL DEFAULT 0,
    "bounced_soft" INTEGER NOT NULL DEFAULT 0,
    "complained" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "clicked" INTEGER NOT NULL DEFAULT 0,
    "bounce_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "complaint_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "open_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "click_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reputation_score" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rbl_checks" (
    "id" TEXT NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "ip_pool_id" TEXT,
    "provider" VARCHAR(100) NOT NULL,
    "listed" BOOLEAN NOT NULL DEFAULT false,
    "return_code" VARCHAR(20),
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "rbl_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Suppression_reason_suppressed_at_idx" ON "Suppression"("reason", "suppressed_at");

-- CreateIndex
CREATE INDEX "Suppression_domain_reason_idx" ON "Suppression"("domain", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "idx_suppression_company_email" ON "Suppression"("company_id", "email");

-- CreateIndex
CREATE INDEX "email_provider_configs_company_id_is_active_priority_idx" ON "email_provider_configs"("company_id", "is_active", "priority");

-- CreateIndex
CREATE INDEX "email_provider_configs_provider_is_active_idx" ON "email_provider_configs"("provider", "is_active");

-- CreateIndex
CREATE INDEX "ip_pools_type_is_active_idx" ON "ip_pools"("type", "is_active");

-- CreateIndex
CREATE INDEX "rate_limits_scope_target_last_reset_idx" ON "rate_limits"("scope", "target", "last_reset");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_scope_target_key" ON "rate_limits"("scope", "target");

-- CreateIndex
CREATE INDEX "dns_records_domain_id_recordType_idx" ON "dns_records"("domain_id", "recordType");

-- CreateIndex
CREATE UNIQUE INDEX "domain_onboarding_domain_id_key" ON "domain_onboarding"("domain_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_tracking_tracking_id_key" ON "email_tracking"("tracking_id");

-- CreateIndex
CREATE INDEX "email_tracking_email_log_id_idx" ON "email_tracking"("email_log_id");

-- CreateIndex
CREATE INDEX "email_tracking_tracking_id_idx" ON "email_tracking"("tracking_id");

-- CreateIndex
CREATE INDEX "reputation_metrics_date_company_id_idx" ON "reputation_metrics"("date", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "reputation_metrics_company_id_domain_id_ip_pool_id_date_key" ON "reputation_metrics"("company_id", "domain_id", "ip_pool_id", "date");

-- CreateIndex
CREATE INDEX "rbl_checks_ip_address_provider_checked_at_idx" ON "rbl_checks"("ip_address", "provider", "checked_at");

-- CreateIndex
CREATE INDEX "rbl_checks_ip_pool_id_listed_idx" ON "rbl_checks"("ip_pool_id", "listed");

-- AddForeignKey
ALTER TABLE "domain_onboarding" ADD CONSTRAINT "domain_onboarding_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
