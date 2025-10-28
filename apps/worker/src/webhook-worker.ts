/**
 * TASK-023: Webhook Delivery Worker (Standalone)
 *
 * Processes webhook delivery jobs from BullMQ queue:
 * - Fetches webhook configuration
 * - Generates HMAC-SHA256 signature
 * - Sends HTTP POST to webhook URL
 * - Records delivery result
 * - Implements retry logic with exponential backoff
 */

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@email-gateway/database';
import axios, { AxiosError } from 'axios';
import { createHmac } from 'crypto';
import Redis from 'ioredis';

interface WebhookJobData {
  webhookId: string;
  eventType: string;
  payload: any;
}

/**
 * Webhook Delivery Worker
 */
class WebhookWorker {
  private worker?: Worker<WebhookJobData>;
  private prisma: PrismaClient;
  private redis: Redis;
  private isShuttingDown = false;

  constructor() {
    this.prisma = new PrismaClient();

    // Initialize Redis connection
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: null, // Required for BullMQ
    });
  }

  /**
   * Start the webhook worker
   */
  async start() {
    console.log('[WebhookWorker] Starting webhook delivery worker...');

    // Initialize BullMQ worker
    this.worker = new Worker<WebhookJobData>(
      'webhook-delivery',
      async (job: Job<WebhookJobData>) => this.processWebhook(job),
      {
        connection: this.redis,
        concurrency: parseInt(process.env.WEBHOOK_CONCURRENCY || '10', 10),
        limiter: {
          max: 100, // Max 100 webhooks per second
          duration: 1000,
        },
      }
    );

    // Event handlers
    this.worker.on('completed', (job: Job) => {
      console.log('[WebhookWorker] ✅ Webhook delivered', {
        jobId: job.id,
        webhookId: job.data.webhookId,
        eventType: job.data.eventType,
      });
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      console.error('[WebhookWorker] ❌ Webhook delivery failed', {
        jobId: job?.id,
        webhookId: job?.data?.webhookId,
        eventType: job?.data?.eventType,
        error: error.message,
        attempts: job?.attemptsMade,
      });
    });

    this.worker.on('error', (error: Error) => {
      console.error('[WebhookWorker] Worker error', error);
    });

    // Handle graceful shutdown
    this.setupGracefulShutdown();

    console.log('[WebhookWorker] ✅ Webhook worker started successfully');
  }

  /**
   * Process a webhook delivery job
   */
  private async processWebhook(job: Job<WebhookJobData>): Promise<void> {
    const { webhookId, eventType, payload } = job.data;
    const startTime = Date.now();

    // Get webhook configuration
    const webhook = await this.prisma.webhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook) {
      console.warn('[WebhookWorker] Webhook not found, skipping', { webhookId });
      return;
    }

    if (!webhook.isActive) {
      console.warn('[WebhookWorker] Webhook not active, skipping', { webhookId });
      return;
    }

    // Create delivery record
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        webhookId,
        eventType,
        payload,
        status: 'PENDING',
      },
    });

    try {
      // Generate HMAC-SHA256 signature
      const signature = this.generateSignature(payload, webhook.secret);

      // Send HTTP POST to webhook URL
      const response = await axios.post(webhook.url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': eventType,
          'X-Webhook-Delivery-Id': delivery.id,
          'User-Agent': 'EmailGateway-Webhook/1.0',
        },
        timeout: 30000, // 30s timeout
        maxRedirects: 0, // Don't follow redirects
        validateStatus: (status) => status >= 200 && status < 300,
      });

      // Update delivery as SUCCESS
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SUCCESS',
          responseCode: response.status,
          responseBody: JSON.stringify(response.data).substring(0, 1000),
          attempts: job.attemptsMade + 1,
          deliveredAt: new Date(),
        },
      });

      const durationMs = Date.now() - startTime;

      console.log('[WebhookWorker] Webhook delivered successfully', {
        webhookId,
        deliveryId: delivery.id,
        responseCode: response.status,
        durationMs,
        attempts: job.attemptsMade + 1,
      });
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const isAxiosError = error instanceof AxiosError;

      // Determine if error is retryable
      const isRetryable = this.isRetryable(error as Error);
      const isLastAttempt = job.attemptsMade >= 2; // 3 total attempts

      // Extract error details
      const responseCode = isAxiosError ? error.response?.status : undefined;
      const errorMessage = isAxiosError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unknown error';

      // Update delivery record
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: isLastAttempt || !isRetryable ? 'FAILED' : 'RETRYING',
          responseCode,
          responseBody: errorMessage.substring(0, 1000),
          attempts: job.attemptsMade + 1,
          nextRetryAt:
            !isLastAttempt && isRetryable
              ? this.getNextRetryTime(job.attemptsMade + 1)
              : undefined,
        },
      });

      console.warn('[WebhookWorker] Webhook delivery failed', {
        webhookId,
        deliveryId: delivery.id,
        responseCode,
        error: errorMessage,
        durationMs,
        attempts: job.attemptsMade + 1,
        retryable: isRetryable,
        willRetry: !isLastAttempt && isRetryable,
      });

      // Only throw (trigger retry) if error is retryable and not last attempt
      if (isRetryable && !isLastAttempt) {
        throw error; // BullMQ will retry with exponential backoff
      }
    }
  }

  /**
   * Generate HMAC-SHA256 signature for webhook payload
   */
  private generateSignature(payload: any, secret: string): string {
    const payloadString = JSON.stringify(payload);
    return createHmac('sha256', secret).update(payloadString).digest('hex');
  }

  /**
   * Determine if error is retryable
   */
  private isRetryable(error: Error): boolean {
    if (error instanceof AxiosError) {
      const status = error.response?.status;

      // Network/timeout errors are retryable
      if (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ECONNABORTED'
      ) {
        return true;
      }

      // 5xx errors are retryable
      if (status && status >= 500) {
        return true;
      }

      // 429 (rate limit) is retryable
      if (status === 429) {
        return true;
      }

      // 4xx errors (except 429) are NOT retryable
      if (status && status >= 400 && status < 500) {
        return false;
      }
    }

    // By default, errors are retryable
    return true;
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  private getNextRetryTime(attempt: number): Date {
    const baseDelay = 5000; // 5 seconds
    const delay = baseDelay * Math.pow(2, attempt - 1);
    return new Date(Date.now() + delay);
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown() {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        console.log('[WebhookWorker] Already shutting down...');
        return;
      }

      this.isShuttingDown = true;
      console.log(`[WebhookWorker] Received ${signal}, initiating graceful shutdown...`);

      try {
        // Stop accepting new jobs
        if (this.worker) {
          await this.worker.close();
          console.log('[WebhookWorker] Worker closed');
        }

        // Disconnect from Prisma
        await this.prisma.$disconnect();
        console.log('[WebhookWorker] Prisma disconnected');

        // Disconnect from Redis
        await this.redis.quit();
        console.log('[WebhookWorker] Redis disconnected');

        console.log('[WebhookWorker] ✅ Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('[WebhookWorker] Error during shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

// Start the worker if run directly
if (require.main === module) {
  const worker = new WebhookWorker();
  worker.start().catch((error) => {
    console.error('[WebhookWorker] Fatal error starting webhook worker', error);
    process.exit(1);
  });
}

export { WebhookWorker };
