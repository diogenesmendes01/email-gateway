-- TASK-026: Add multi-tenant fields to companies table

-- Domínio personalizado
ALTER TABLE "companies" ADD COLUMN "default_from_address" VARCHAR(254);
ALTER TABLE "companies" ADD COLUMN "default_from_name" VARCHAR(100);
ALTER TABLE "companies" ADD COLUMN "domain_id" TEXT;

-- Limites de envio
ALTER TABLE "companies" ADD COLUMN "daily_email_limit" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "companies" ADD COLUMN "monthly_email_limit" INTEGER;

-- Curadoria e Status
ALTER TABLE "companies" ADD COLUMN "is_approved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "companies" ADD COLUMN "is_suspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "companies" ADD COLUMN "suspension_reason" TEXT;
ALTER TABLE "companies" ADD COLUMN "approved_at" TIMESTAMP(3);
ALTER TABLE "companies" ADD COLUMN "approved_by" VARCHAR(128);

-- Métricas em cache
ALTER TABLE "companies" ADD COLUMN "bounce_rate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "companies" ADD COLUMN "complaint_rate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "companies" ADD COLUMN "last_metrics_update" TIMESTAMP(3);

-- Foreign key para domínio padrão
ALTER TABLE "companies" ADD CONSTRAINT "companies_domain_id_fkey"
  FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE SET NULL;

-- Índices para performance
CREATE INDEX "idx_companies_approval_status" ON "companies"("is_approved", "is_suspended");
CREATE INDEX "idx_companies_bounce_rate" ON "companies"("bounce_rate");
CREATE INDEX "idx_companies_complaint_rate" ON "companies"("complaint_rate");
CREATE INDEX "idx_companies_domain_id" ON "companies"("domain_id");

-- Comentários
COMMENT ON COLUMN "companies"."default_from_address" IS 'Email address to send from (e.g., vendas@empresa.com)';
COMMENT ON COLUMN "companies"."daily_email_limit" IS 'Maximum emails per day (default: 1000 for sandbox)';
COMMENT ON COLUMN "companies"."is_approved" IS 'Company approved after curation (default: false for sandbox)';
COMMENT ON COLUMN "companies"."is_suspended" IS 'Company suspended due to poor reputation';
COMMENT ON COLUMN "companies"."bounce_rate" IS 'Cached bounce rate % (updated by cron)';
COMMENT ON COLUMN "companies"."complaint_rate" IS 'Cached complaint rate % (updated by cron)';
