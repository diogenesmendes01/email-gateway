/**
 * TASK-021: Admin DLQ Service
 *
 * Service layer for DLQ management operations
 * Interfaces with Worker's DLQMonitorService via queue inspection
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';

export interface DLQJobInfo {
  id: string;
  data: any;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
  ageHours: number;
  finishedOn?: number;
  processedOn?: number;
  stacktrace?: string[];
}

export interface DLQStats {
  total: number;
  oldJobs: number; // >24h
  recentJobs: number; // <1h
  oldestJobAge: number;
  commonErrors: { reason: string; count: number }[];
}

@Injectable()
export class AdminDLQService {
  private readonly logger = new Logger(AdminDLQService.name);
  private queue: Queue;

  constructor(private readonly configService: ConfigService) {
    this.queue = new Queue('email-queue', {
      connection: {
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
      },
    });
  }

  /**
   * Get all failed jobs from DLQ
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
        finishedOn: job.finishedOn,
        processedOn: job.processedOn,
        stacktrace: job.stacktrace,
      }));
  }

  /**
   * Get DLQ statistics
   */
  async getDLQStats(): Promise<DLQStats> {
    const jobs = await this.getDLQJobs(1000);
    const total = jobs.length;

    // Jobs older than 24 hours
    const oldJobs = jobs.filter((j) => j.ageHours > 24).length;

    // Recent jobs (less than 1 hour)
    const recentJobs = jobs.filter((j) => j.ageHours < 1).length;

    // Oldest job age
    const oldestJobAge = jobs.length > 0 ? Math.max(...jobs.map((j) => j.ageHours)) : 0;

    // Common errors
    const errorCounts = jobs.reduce((acc, job) => {
      const reason = job.failedReason || 'Unknown';
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const commonErrors = Object.entries(errorCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      total,
      oldJobs,
      recentJobs,
      oldestJobAge,
      commonErrors,
    };
  }

  /**
   * Get specific job details
   */
  async getJob(jobId: string): Promise<Job | undefined> {
    return await this.queue.getJob(jobId);
  }

  /**
   * Retry a specific job from DLQ
   */
  async retryJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found in DLQ`);
    }

    await job.retry();

    this.logger.log({
      message: 'Job manually retried from DLQ',
      jobId,
      outboxId: job.data.outboxId,
      retriedBy: 'admin',
    });
  }

  /**
   * Remove a job from DLQ permanently
   */
  async removeJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found in DLQ`);
    }

    await job.remove();

    this.logger.log({
      message: 'Job manually removed from DLQ',
      jobId,
      outboxId: job.data.outboxId,
      removedBy: 'admin',
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

    this.logger.log({
      message: 'Bulk retry operation completed',
      totalJobs: jobIds.length,
      succeeded: succeeded.length,
      failed: failed.length,
    });

    return { succeeded, failed };
  }

  /**
   * Clean old jobs from DLQ (>7 days)
   */
  async cleanOldJobs(daysOld: number = 7): Promise<number> {
    const jobs = await this.getDLQJobs(1000);
    const cutoffHours = daysOld * 24;
    const oldJobs = jobs.filter((j) => j.ageHours > cutoffHours);

    let removed = 0;
    for (const job of oldJobs) {
      try {
        await this.removeJob(job.id);
        removed++;
      } catch (error) {
        this.logger.error({
          message: 'Failed to remove old job',
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.log({
      message: 'Cleaned old jobs from DLQ',
      daysOld,
      totalRemoved: removed,
    });

    return removed;
  }
}
