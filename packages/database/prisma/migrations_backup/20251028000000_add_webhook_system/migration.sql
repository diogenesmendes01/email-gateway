-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'RETRYING');

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

-- CreateIndex
CREATE INDEX "idx_webhooks_company_active" ON "webhooks"("company_id", "is_active");

-- CreateIndex
CREATE INDEX "idx_webhook_deliveries_webhook" ON "webhook_deliveries"("webhook_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_webhook_deliveries_status" ON "webhook_deliveries"("status", "next_retry_at");

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add comments for documentation
COMMENT ON TABLE "webhooks" IS 'TASK-023: Webhook configurations for real-time event notifications';
COMMENT ON TABLE "webhook_deliveries" IS 'TASK-023: Webhook delivery attempts and logs';
COMMENT ON COLUMN "webhooks"."url" IS 'HTTPS endpoint to receive webhook events';
COMMENT ON COLUMN "webhooks"."secret" IS 'Secret key for HMAC-SHA256 signature verification';
COMMENT ON COLUMN "webhooks"."events" IS 'Array of event types to trigger webhook (email.sent, email.failed, etc.)';
COMMENT ON COLUMN "webhook_deliveries"."payload" IS 'JSON payload sent to webhook endpoint';
COMMENT ON COLUMN "webhook_deliveries"."response_code" IS 'HTTP status code from webhook endpoint';
COMMENT ON COLUMN "webhook_deliveries"."attempts" IS 'Number of delivery attempts (max 3)';
