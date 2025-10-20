-- CreateEnum
CREATE TYPE "DomainVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'TEMPORARY_FAILURE');

-- CreateEnum
CREATE TYPE "DKIMVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "domain" VARCHAR(253) NOT NULL,
    "status" "DomainVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "dkim_status" "DKIMVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "dkim_tokens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "spf_record" VARCHAR(255),
    "dkim_records" JSONB,
    "dmarc_record" VARCHAR(255),
    "last_checked" TIMESTAMP(3),
    "last_verified" TIMESTAMP(3),
    "error_message" TEXT,
    "warmup_config" JSONB,
    "is_production_ready" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domains_company_id_domain_key" ON "domains"("company_id", "domain");

-- CreateIndex
CREATE INDEX "domains_company_id_status_idx" ON "domains"("company_id", "status");

-- CreateIndex
CREATE INDEX "domains_domain_idx" ON "domains"("domain");

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
