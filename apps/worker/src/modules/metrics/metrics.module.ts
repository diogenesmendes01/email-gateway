/**
 * TASK-020/021: Worker Metrics Module
 *
 * Configures custom Prometheus metrics for business monitoring
 */

import { Module } from '@nestjs/common';
import { PrometheusModule, makeCounterProvider, makeHistogramProvider, makeGaugeProvider } from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';

@Module({
  imports: [PrometheusModule],
  providers: [
    MetricsService,
    makeCounterProvider({
      name: 'email_sent_total',
      help: 'Total number of emails successfully sent',
      labelNames: ['company_id', 'provider'],
    }),
    makeCounterProvider({
      name: 'email_failed_total',
      help: 'Total number of failed emails',
      labelNames: ['company_id', 'reason', 'provider'],
    }),
    makeCounterProvider({
      name: 'email_retry_total',
      help: 'Total number of email retries',
      labelNames: ['company_id', 'attempt'],
    }),
    makeHistogramProvider({
      name: 'email_send_duration_seconds',
      help: 'Email send duration in seconds',
      labelNames: ['company_id'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
    }),
    makeGaugeProvider({
      name: 'email_queue_size',
      help: 'Current size of email queue',
      labelNames: ['queue'],
    }),
    // TASK-021: DLQ metrics
    makeGaugeProvider({
      name: 'dlq_size',
      help: 'Number of jobs in Dead Letter Queue',
    }),
    makeGaugeProvider({
      name: 'dlq_oldest_job_age_hours',
      help: 'Age of oldest job in DLQ (hours)',
    }),
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
