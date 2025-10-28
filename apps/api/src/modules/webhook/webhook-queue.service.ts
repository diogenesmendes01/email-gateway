/**
 * TASK-023: Webhook Queue Service
 *
 * Manages the BullMQ queue for webhook delivery jobs
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';
import { WebhookJobData } from './types/webhook.types';

@Injectable()
export class WebhookQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookQueueService.name);
  private queue!: Queue<WebhookJobData>;
  private queueEvents!: QueueEvents;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = {
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
    };

    // Initialize webhook delivery queue
    this.queue = new Queue<WebhookJobData>('webhook-delivery', {
      connection: redisConfig,
      defaultJobOptions: {
        attempts: 3, // Max 3 delivery attempts
        backoff: {
          type: 'exponential',
          delay: 5000, // 5s, 10s, 20s
        },
        removeOnComplete: {
          count: 100, // Keep last 100 completed
          age: 86400, // Keep for 24 hours
        },
        removeOnFail: false, // Keep failed for investigation
      },
    });

    // Set up queue events for monitoring
    this.queueEvents = new QueueEvents('webhook-delivery', {
      connection: redisConfig,
    });

    this.queueEvents.on('completed', ({ jobId }) => {
      this.logger.debug({
        message: 'Webhook delivered successfully',
        jobId,
      });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.logger.warn({
        message: 'Webhook delivery failed',
        jobId,
        reason: failedReason,
      });
    });

    this.logger.log('Webhook queue service initialized');
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.queueEvents.close();
    this.logger.log('Webhook queue service closed');
  }

  /**
   * Enqueue a webhook delivery job
   *
   * @param webhookId Webhook configuration ID
   * @param eventType Event type (e.g. 'email.sent')
   * @param payload Webhook payload to send
   * @returns Job ID
   */
  async enqueueWebhookDelivery(
    webhookId: string,
    eventType: string,
    payload: any
  ): Promise<string> {
    const jobData: WebhookJobData = {
      webhookId,
      eventType,
      payload,
    };

    const job = await this.queue.add('deliver', jobData, {
      jobId: `webhook-${webhookId}-${Date.now()}`,
      priority: this.getPriority(eventType),
    });

    this.logger.debug({
      message: 'Webhook job enqueued',
      jobId: job.id,
      webhookId,
      eventType,
    });

    return job.id!;
  }

  /**
   * Get queue health metrics
   */
  async getQueueHealth() {
    const waiting = await this.queue.getWaitingCount();
    const active = await this.queue.getActiveCount();
    const completed = await this.queue.getCompletedCount();
    const failed = await this.queue.getFailedCount();
    const delayed = await this.queue.getDelayedCount();

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }

  /**
   * Get priority for event type
   * Critical events (failures, bounces) get higher priority
   */
  private getPriority(eventType: string): number {
    const priorities: Record<string, number> = {
      'email.failed': 1, // Highest priority
      'email.bounced': 1,
      'email.complained': 1,
      'email.sent': 2,
      'email.delivered': 3,
      'webhook.test': 5, // Lowest priority
    };

    return priorities[eventType] || 3;
  }

  /**
   * Pause queue (for maintenance)
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    this.logger.warn('Webhook queue paused');
  }

  /**
   * Resume queue
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    this.logger.log('Webhook queue resumed');
  }

  /**
   * Clean old completed/failed jobs
   */
  async clean(olderThanMs: number = 86400000): Promise<void> {
    await this.queue.clean(olderThanMs, 100, 'completed');
    await this.queue.clean(olderThanMs * 7, 100, 'failed'); // Keep failed for 7 days
    this.logger.log('Webhook queue cleaned');
  }
}
