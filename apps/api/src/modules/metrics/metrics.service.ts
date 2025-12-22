/**
 * TASK-020: Metrics Service
 *
 * Provides custom business metrics for Prometheus monitoring
 */

import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('email_sent_total')
    public emailSentCounter: Counter<string>,

    @InjectMetric('email_failed_total')
    public emailFailedCounter: Counter<string>,

    @InjectMetric('email_retry_total')
    public emailRetryCounter: Counter<string>,

    @InjectMetric('email_send_duration_seconds')
    public emailSendDuration: Histogram<string>,

    @InjectMetric('email_queue_size')
    public emailQueueSize: Gauge<string>,

    @InjectMetric('encryption_duration_seconds')
    public encryptionDuration: Histogram<string>,

    // TASK-025: Batch email metrics
    @InjectMetric('email_batch_created_total')
    public batchCreatedCounter: Counter<string>,

    @InjectMetric('email_batch_completed_total')
    public batchCompletedCounter: Counter<string>,

    @InjectMetric('email_batch_size')
    public batchSizeHistogram: Histogram<string>,

    @InjectMetric('email_batch_processing_duration_seconds')
    public batchProcessingDuration: Histogram<string>,

    // TASK-038: Multi-tenant blocking metrics
    @InjectMetric('tenant_quota_exceeded_total')
    public quotaExceededCounter: Counter<string>,

    @InjectMetric('tenant_suspended_access_total')
    public tenantSuspendedCounter: Counter<string>,

    @InjectMetric('tenant_unapproved_access_total')
    public tenantUnapprovedCounter: Counter<string>,

    @InjectMetric('tenant_domain_access_denied_total')
    public domainAccessDeniedCounter: Counter<string>,
  ) {}

  /**
   * Track successful email sent
   */
  recordEmailSent(companyId: string, provider: string = 'ses') {
    this.emailSentCounter.inc({
      company_id: companyId,
      provider,
    });
  }

  /**
   * Track email failure
   */
  recordEmailFailed(companyId: string, reason: string, provider: string = 'ses') {
    this.emailFailedCounter.inc({
      company_id: companyId,
      reason,
      provider,
    });
  }

  /**
   * Track email retry
   */
  recordEmailRetry(companyId: string, attemptNumber: number) {
    this.emailRetryCounter.inc({
      company_id: companyId,
      attempt: attemptNumber.toString(),
    });
  }

  /**
   * Track email send duration
   */
  recordEmailSendDuration(durationSeconds: number, companyId: string) {
    this.emailSendDuration.observe(
      {
        company_id: companyId,
      },
      durationSeconds
    );
  }

  /**
   * Track queue size
   */
  updateQueueSize(queueName: string, size: number) {
    this.emailQueueSize.set({ queue: queueName }, size);
  }

  /**
   * Track encryption performance
   */
  recordEncryptionDuration(durationSeconds: number) {
    this.encryptionDuration.observe(durationSeconds);
  }

  /**
   * TASK-025: Track batch created
   */
  recordBatchCreated(companyId: string, totalEmails: number) {
    this.batchCreatedCounter.inc({
      company_id: companyId,
    });

    this.batchSizeHistogram.observe(
      {
        company_id: companyId,
      },
      totalEmails
    );
  }

  /**
   * TASK-025: Track batch completed
   */
  recordBatchCompleted(
    companyId: string,
    status: string,
    durationSeconds: number,
    successCount: number,
    failedCount: number
  ) {
    this.batchCompletedCounter.inc({
      company_id: companyId,
      status,
    });

    this.batchProcessingDuration.observe(
      {
        company_id: companyId,
        status,
      },
      durationSeconds
    );
  }

  /**
   * TASK-038: Track quota exceeded blocks
   */
  recordQuotaExceeded(companyId: string, currentCount: number, limit: number) {
    this.quotaExceededCounter.inc({
      company_id: companyId,
      current_count: currentCount.toString(),
      limit: limit.toString(),
    });
  }

  /**
   * TASK-038: Track suspended tenant access blocks
   */
  recordTenantSuspended(companyId: string, suspensionReason?: string) {
    this.tenantSuspendedCounter.inc({
      company_id: companyId,
      suspension_reason: suspensionReason || 'unknown',
    });
  }

  /**
   * TASK-038: Track unapproved tenant access blocks
   */
  recordTenantUnapproved(companyId: string) {
    this.tenantUnapprovedCounter.inc({
      company_id: companyId,
    });
  }

  /**
   * TASK-038: Track domain access denied
   */
  recordDomainAccessDenied(companyId: string, domainId: string, action: string) {
    this.domainAccessDeniedCounter.inc({
      company_id: companyId,
      domain_id: domainId,
      action, // get, post, verify, delete
    });
  }
}
