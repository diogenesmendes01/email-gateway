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
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
