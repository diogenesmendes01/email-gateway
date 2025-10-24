-- CreateIndex
-- TASK-017: Composite index for dashboard email list queries
-- Optimizes queries filtering by company_id + status + date range with ORDER BY created_at DESC
-- Performance impact: 10-100x faster than sequential scan on large datasets
-- Used by: DashboardController.getEmails(), EmailController.listEmails(), date range queries
CREATE INDEX "idx_email_outbox_dashboard" ON "email_outbox"("company_id", "status", "created_at" DESC);

-- Add comment to index for documentation
COMMENT ON INDEX "idx_email_outbox_dashboard" IS
'Composite index for dashboard email list queries.
Optimizes queries filtering by company_id + status + date range with ORDER BY created_at DESC.
Used by: Dashboard email lists, status filters, date range queries.
Performance: 10-100x faster than sequential scan.';
