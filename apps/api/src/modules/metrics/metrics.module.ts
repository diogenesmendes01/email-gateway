/**
 * TASK-020: Metrics Module
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
      buckets: [0.1, 0.5, 1, 2, 5, 10], // 100ms, 500ms, 1s, 2s, 5s, 10s
    }),
    makeGaugeProvider({
      name: 'email_queue_size',
      help: 'Current size of email queue',
      labelNames: ['queue'],
    }),
    makeHistogramProvider({
      name: 'encryption_duration_seconds',
      help: 'CPF/CNPJ encryption duration in seconds',
      buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1], // 10ms, 50ms, 100ms, 200ms, 500ms, 1s
    }),
    // TASK-025: Batch email metrics
    makeCounterProvider({
      name: 'email_batch_created_total',
      help: 'Total number of email batches created',
      labelNames: ['company_id'],
    }),
    makeCounterProvider({
      name: 'email_batch_completed_total',
      help: 'Total number of email batches completed',
      labelNames: ['company_id', 'status'], // status: COMPLETED, PARTIAL, FAILED
    }),
    makeHistogramProvider({
      name: 'email_batch_size',
      help: 'Number of emails in batch',
      labelNames: ['company_id'],
      buckets: [10, 50, 100, 250, 500, 750, 1000], // Batch size buckets
    }),
    makeHistogramProvider({
      name: 'email_batch_processing_duration_seconds',
      help: 'Batch processing duration in seconds',
      labelNames: ['company_id', 'status'],
      buckets: [1, 5, 10, 30, 60, 120, 300], // 1s, 5s, 10s, 30s, 1min, 2min, 5min
    }),
    // TASK-038: Multi-tenant blocking metrics
    makeCounterProvider({
      name: 'tenant_quota_exceeded_total',
      help: 'Total number of quota exceeded blocks',
      labelNames: ['company_id', 'current_count', 'limit'],
    }),
    makeCounterProvider({
      name: 'tenant_suspended_access_total',
      help: 'Total number of suspended tenant access blocks',
      labelNames: ['company_id', 'suspension_reason'],
    }),
    makeCounterProvider({
      name: 'tenant_unapproved_access_total',
      help: 'Total number of unapproved tenant access blocks',
      labelNames: ['company_id'],
    }),
    makeCounterProvider({
      name: 'tenant_domain_access_denied_total',
      help: 'Total number of domain access denied blocks',
      labelNames: ['company_id', 'domain_id', 'action'],
    }),
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
