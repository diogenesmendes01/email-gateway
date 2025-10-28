/**
 * TASK-021: DLQ Monitor Service
 *
 * Monitors Dead Letter Queue (DLQ) and provides:
 * - Automatic DLQ size tracking
 * - Old job detection (>24h)
 * - High failure rate alerts
 * - Manual job retry/removal
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../modules/metrics/metrics.service';

export interface DLQJobInfo {
  id: string;
  data: any;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
  ageHours: number;
  stacktrace?: string[];
}

@Injectable()
export class DLQMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DLQMonitorService.name);
  private queue: Queue;
  private checkInterval!: NodeJS.Timeout;
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService
  ) {
    this.queue = new Queue('email-queue', {
      connection: {
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
      },
    });
  }

  async onModuleInit() {
    this.logger.log('DLQ Monitor Service initialized');

    // Check DLQ every 5 minutes
    this.checkInterval = setInterval(() => {
      this.monitorDLQ();
    }, this.CHECK_INTERVAL_MS);

    // Run immediately on startup
    await this.monitorDLQ();
  }

  async onModuleDestroy() {
    this.logger.log('DLQ Monitor Service shutting down');

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    await this.queue.close();
  }

  /**
   * Monitor DLQ size and emit metrics/alerts
   */
  async monitorDLQ() {
    try {
      const failedJobs = await this.queue.getFailed(0, 1000); // Get up to 1000 failed jobs
      const dlqSize = failedJobs.length;

      // Update Prometheus metric
      this.metricsService.updateDLQSize(dlqSize);

      // Calculate oldest job age
      if (dlqSize > 0) {
        const oldestJob = failedJobs[0];
        const oldestAge = (Date.now() - oldestJob.timestamp) / (1000 * 60 * 60); // hours
        this.metricsService.updateDLQOldestJobAge(oldestAge);
      } else {
        this.metricsService.updateDLQOldestJobAge(0);
      }

      // Log if DLQ not empty
      if (dlqSize > 0) {
        this.logger.warn({
          message: 'DLQ contains failed jobs',
          dlqSize,
          oldestJobId: failedJobs[0]?.id,
          oldestJobAge: Math.round((Date.now() - failedJobs[0]?.timestamp) / (1000 * 60 * 60)),
          newestJobId: failedJobs[dlqSize - 1]?.id,
        });

        // Check for old jobs (>24h)
        const oldJobs = failedJobs.filter((job) => {
          const ageHours = (Date.now() - job.timestamp) / (1000 * 60 * 60);
          return ageHours > 24;
        });

        if (oldJobs.length > 0) {
          this.logger.error({
            message: '🚨 CRITICAL: DLQ contains jobs older than 24h',
            oldJobsCount: oldJobs.length,
            oldestJobAge: Math.round(
              (Date.now() - oldJobs[0].timestamp) / (1000 * 60 * 60)
            ),
            action: 'Investigate immediately via /admin/dlq endpoint',
          });

          // Trigger critical alert
          await this.sendCriticalAlert(oldJobs.length, oldJobs[0]);
        }
      }

      // Check for rapidly growing DLQ (potential systemic issue)
      const recentFailures = failedJobs.filter((job) => {
        const ageMinutes = (Date.now() - job.timestamp) / (1000 * 60);
        return ageMinutes < 10; // Last 10 minutes
      });

      if (recentFailures.length > 50) {
        this.logger.error({
          message: '🚨 HIGH FAILURE RATE: Potential systemic issue detected',
          recentFailures: recentFailures.length,
          timeWindowMinutes: 10,
          action: 'Check SES status, database connectivity, Redis health',
        });

        await this.sendHighFailureRateAlert(recentFailures.length);
      }
    } catch (error) {
      this.logger.error({
        message: 'Failed to monitor DLQ',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  /**
   * Get all failed jobs from DLQ with details
   */
  async getDLQJobs(limit: number = 100): Promise<DLQJobInfo[]> {
    const failedJobs = await this.queue.getFailed(0, limit);

    return failedJobs
      .filter((job) => job.id !== undefined)
      .map((job) => ({
        id: job.id as string,
        data: job.data,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        ageHours: Math.round((Date.now() - job.timestamp) / (1000 * 60 * 60)),
        stacktrace: job.stacktrace,
      }));
  }

  /**
   * Retry a specific job from DLQ
   */
  async retryJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found in DLQ`);
    }

    // Move job back to waiting queue
    await job.retry();

    this.logger.log({
      message: 'Job manually retried from DLQ',
      jobId,
      outboxId: job.data.outboxId,
      action: 'moved_to_waiting',
    });
  }

  /**
   * Remove a job from DLQ (after manual investigation)
   */
  async removeJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found in DLQ`);
    }

    await job.remove();

    this.logger.log({
      message: 'Job manually removed from DLQ',
      jobId,
      outboxId: job.data.outboxId,
      action: 'permanently_deleted',
    });
  }

  /**
   * Bulk retry multiple jobs
   */
  async bulkRetry(jobIds: string[]): Promise<{ succeeded: string[]; failed: string[] }> {
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const jobId of jobIds) {
      try {
        await this.retryJob(jobId);
        succeeded.push(jobId);
      } catch (error) {
        failed.push(jobId);
        this.logger.error({
          message: 'Failed to retry job in bulk operation',
          jobId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { succeeded, failed };
  }

  /**
   * Send critical alert (DLQ has old jobs)
   */
  private async sendCriticalAlert(oldJobsCount: number, oldestJob: Job) {
    this.logger.error({
      message: '🚨 CRITICAL ALERT: DLQ contains old jobs',
      severity: 'critical',
      oldJobsCount,
      oldestJobId: oldestJob.id,
      oldestJobAge: Math.round((Date.now() - oldestJob.timestamp) / (1000 * 60 * 60)),
      action: 'Investigate immediately',
      endpoint: '/admin/dlq',
    });

    // TODO: Integrate with alerting system (Slack, PagerDuty, etc.)
    // await this.slackService.sendAlert({ ... });
  }

  /**
   * Send high failure rate alert
   */
  private async sendHighFailureRateAlert(recentFailures: number) {
    this.logger.error({
      message: '🚨 HIGH FAILURE RATE ALERT: Potential systemic issue',
      severity: 'critical',
      recentFailures,
      timeWindow: '10 minutes',
      action: 'Check SES status, database, Redis',
    });

    // TODO: Integrate with alerting system
    // await this.slackService.sendAlert({ ... });
  }
}
