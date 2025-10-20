-- CreateEnum
CREATE TYPE "DomainVerificationStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'TEMPORARY_FAILURE');

-- CreateEnum
CREATE TYPE "DKIMVerificationStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" "DomainVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verification_token" VARCHAR(255),
    "dkim_enabled" BOOLEAN NOT NULL DEFAULT false,
    "dkim_tokens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dkim_status" "DKIMVerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "last_checked" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domains_name_key" ON "domains"("name");

-- CreateIndex
CREATE INDEX "domains_company_id_idx" ON "domains"("company_id");

-- CreateIndex
CREATE INDEX "domains_status_idx" ON "domains"("status");

-- CreateIndex
CREATE INDEX "domains_last_checked_idx" ON "domains"("last_checked");

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
