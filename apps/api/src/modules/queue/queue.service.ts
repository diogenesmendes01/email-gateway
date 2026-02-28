/**
 * TASK 8.2 - Queue Service
 *
 * Integrates API with BullMQ to enqueue email jobs for worker processing
 * Fixes critical missing piece: API → Queue → Worker flow
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue, QueueOptions } from 'bullmq';
import Redis from 'ioredis';
import { EMAIL_JOB_CONFIG, EmailSendJobData, QueueHealth, getQueueHealth as getQueueHealthFromShared } from '@email-gateway/shared';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private queue!: Queue;
  private redis!: Redis;

  async onModuleInit() {
    // Initialize Redis connection for BullMQ
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    // Wait for Redis connection
    await new Promise<void>((resolve, reject) => {
      this.redis.once('ready', () => {
        this.logger.log(`Redis connected: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
        resolve();
      });

      this.redis.once('error', (error) => {
        this.logger.error(`Redis connection failed: ${error.message}`);
        reject(error);
      });
    });

    // Initialize BullMQ Queue with configuration from shared package
    const queueOptions: QueueOptions = {
      connection: this.redis,
      defaultJobOptions: {
        attempts: EMAIL_JOB_CONFIG.MAX_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: EMAIL_JOB_CONFIG.BACKOFF_DELAYS[0], // 2000ms initial delay
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24h
          count: 1000, // Keep last 1000
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    };

    this.queue = new Queue(EMAIL_JOB_CONFIG.QUEUE_NAME, queueOptions);

    this.logger.log(`Queue initialized: ${EMAIL_JOB_CONFIG.QUEUE_NAME}`);
    this.logger.log(`   Max attempts: ${EMAIL_JOB_CONFIG.MAX_ATTEMPTS}`);
    this.logger.log(`   Backoff delays: ${EMAIL_JOB_CONFIG.BACKOFF_DELAYS.join(', ')}ms`);

    // Log initial queue health
    const health = await this.getQueueHealth();
    this.logger.log(`Queue health: waiting=${health.waiting}, active=${health.active}, failed=${health.failed}`);
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down queue service...');

    if (this.queue) {
      await this.queue.close();
      this.logger.log('Queue closed');
    }

    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Redis disconnected');
    }
  }

  /**
   * Enqueue email send job
   *
   * @param jobData - Email job data from shared types
   * @returns Job ID (same as outboxId for idempotency)
   */
  async enqueueEmailJob(jobData: EmailSendJobData): Promise<string> {
    try {
      // Use outboxId as jobId for idempotency
      // If same outboxId is enqueued twice, BullMQ will return existing job
      const job = await this.queue.add(
        'send-email', // Job name
        jobData,
        {
          jobId: jobData.outboxId, // Idempotency key
          priority: 1, // Lower number = higher priority
        }
      );

      this.logger.log({
        message: 'Email job enqueued',
        jobId: job.id,
        outboxId: jobData.outboxId,
        companyId: jobData.companyId,
        to: jobData.to,
        requestId: jobData.requestId,
      });

      return job.id!;
    } catch (error) {
      this.logger.error({
        message: 'Failed to enqueue email job',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        outboxId: jobData.outboxId,
        companyId: jobData.companyId,
      });

      throw error;
    }
  }

  /**
   * Get queue health metrics
   * Used for monitoring and health checks
   */
  async getQueueHealth(): Promise<QueueHealth> {
    return getQueueHealthFromShared(this.queue);
  }

  /**
   * Check if queue is healthy
   * Returns false if queue depth is too high (potential backlog)
   */
  async isHealthy(): Promise<boolean> {
    const health = await this.getQueueHealth();

    // Queue is unhealthy if:
    // - Too many waiting jobs (> 1000)
    // - Too many failed jobs (> 50)
    const isHealthy = health.waiting < 1000 && health.failed < 50;

    if (!isHealthy) {
      this.logger.warn({
        message: 'Queue health degraded',
        ...health,
      });
    }

    return isHealthy;
  }

  /**
   * Get specific job by ID
   */
  async getJob(jobId: string) {
    return this.queue.getJob(jobId);
  }

  /**
   * Pause queue (stops processing new jobs)
   */
  async pause() {
    await this.queue.pause();
    this.logger.warn('Queue paused');
  }

  /**
   * Resume queue
   */
  async resume() {
    await this.queue.resume();
    this.logger.log('Queue resumed');
  }
}
