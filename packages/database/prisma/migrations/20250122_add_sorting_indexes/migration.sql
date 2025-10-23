-- CreateIndex
CREATE INDEX "email_logs_status_created_at_idx" ON "email_logs"("status", "created_at");

-- CreateIndex
CREATE INDEX "email_logs_sent_at_idx" ON "email_logs"("sent_at");

-- CreateIndex
CREATE INDEX "email_logs_attempts_created_at_idx" ON "email_logs"("attempts", "created_at");

-- CreateIndex
CREATE INDEX "email_logs_duration_ms_idx" ON "email_logs"("duration_ms");
