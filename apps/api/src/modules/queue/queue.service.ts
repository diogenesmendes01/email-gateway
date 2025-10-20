import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { EMAIL_JOB_CONFIG, EmailSendJobData } from '@email-gateway/shared';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private queue!: Queue<EmailSendJobData>;
  private redis!: Redis;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: this.configService.get<number>('REDIS_DB', 0),
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue<EmailSendJobData>(EMAIL_JOB_CONFIG.QUEUE_NAME, {
      connection: this.redis,
      defaultJobOptions: {
        attempts: EMAIL_JOB_CONFIG.MAX_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: EMAIL_JOB_CONFIG.BACKOFF_DELAYS[0] * 1000,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 1000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600,
        },
      },
    });

    // Log inicial de saúde da fila e alertas simples
    try {
      const health = await this.getQueueHealth();
      // Log estruturado
      // eslint-disable-next-line no-console
      console.log({
        message: '[QueueService] Initialized',
        queue: EMAIL_JOB_CONFIG.QUEUE_NAME,
        health,
      });

      const waitingThreshold = this.configService.get<number>('QUEUE_ALERT_WAITING_THRESHOLD', 1000);
      const failedThreshold = this.configService.get<number>('QUEUE_ALERT_FAILED_THRESHOLD', 50);

      if (health.waiting > waitingThreshold) {
        // eslint-disable-next-line no-console
        console.warn({
          message: '[QueueService] ALERT: waiting jobs above threshold',
          waiting: health.waiting,
          threshold: waitingThreshold,
        });
      }
      if (health.failed > failedThreshold) {
        // eslint-disable-next-line no-console
        console.error({
          message: '[QueueService] ALERT: failed jobs above threshold',
          failed: health.failed,
          threshold: failedThreshold,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[QueueService] Failed to fetch initial queue health', err);
    }
  }

  async onModuleDestroy() {
    if (this.queue) await this.queue.close();
    if (this.redis) await this.redis.quit();
  }

  async enqueueEmailJob(jobData: EmailSendJobData): Promise<string> {
    const job = await this.queue.add('send-email', jobData, {
      jobId: jobData.outboxId,
      priority: jobData as any && (jobData as any).priority ? (jobData as any).priority : EMAIL_JOB_CONFIG.DEFAULT_PRIORITY,
    });
    return job.id as string;
  }

  async getQueueHealth() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }
}


