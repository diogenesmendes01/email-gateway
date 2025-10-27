/**
 * TASK-020/021: Worker Metrics Service
 *
 * Provides custom business metrics for Prometheus monitoring
 * Including DLQ metrics (TASK-021)
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

    // TASK-021: DLQ metrics
    @InjectMetric('dlq_size')
    public dlqSizeGauge: Gauge<string>,

    @InjectMetric('dlq_oldest_job_age_hours')
    public dlqOldestJobAgeGauge: Gauge<string>,
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
   * TASK-021: Update DLQ size metric
   */
  updateDLQSize(size: number) {
    this.dlqSizeGauge.set(size);
  }

  /**
   * TASK-021: Update DLQ oldest job age metric
   */
  updateDLQOldestJobAge(ageHours: number) {
    this.dlqOldestJobAgeGauge.set(ageHours);
  }
}
