/**
 * Webhook Ingest Queue Service
 *
 * Manages the BullMQ queue for webhook ingest jobs (provider -> internal processing).
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, QueueEvents } from 'bullmq';

export interface WebhookIngestJobData {
  provider: 'postal' | 'mailu' | 'haraka' | 'ses';
  event: {
    type: 'delivery' | 'bounce' | 'complaint' | 'open' | 'click' | 'unknown';
    messageId: string;
    timestamp: Date;
    metadata: Record<string, any>;
  };
  rawPayload: Record<string, any>;
  receivedAt: Date;
}

@Injectable()
export class WebhookIngestQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookIngestQueueService.name);
  private queue!: Queue<WebhookIngestJobData>;
  private queueEvents!: QueueEvents;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = {
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
    } as any;

    this.queue = new Queue<WebhookIngestJobData>('webhook-ingest', {
      connection: redisConfig,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100, age: 86400 },
        removeOnFail: false,
      },
    });

    this.queueEvents = new QueueEvents('webhook-ingest', { connection: redisConfig });

    this.queueEvents.on('completed', ({ jobId }) => {
      this.logger.debug({ message: 'Webhook ingest processed', jobId });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.logger.warn({ message: 'Webhook ingest failed', jobId, reason: failedReason });
    });

    this.logger.log('Webhook ingest queue service initialized');
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.queueEvents?.close();
    this.logger.log('Webhook ingest queue service closed');
  }

  async enqueue(job: WebhookIngestJobData): Promise<string> {
    const created = await this.queue.add('ingest', job, {
      jobId: `ingest-${job.provider}-${job.event.type}-${Date.now()}`,
      priority: this.getPriority(job.event.type),
    });
    return created.id!;
  }

  private getPriority(eventType: WebhookIngestJobData['event']['type']): number {
    const priorities: Record<string, number> = {
      bounce: 1,
      complaint: 1,
      delivery: 2,
      open: 4,
      click: 4,
      unknown: 5,
    };
    return priorities[eventType] ?? 3;
  }
}

