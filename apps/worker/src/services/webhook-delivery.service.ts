/**
 * TASK-023: Webhook Delivery Worker
 *
 * BullMQ worker that processes webhook delivery jobs:
 * - Fetches webhook configuration
 * - Generates HMAC-SHA256 signature
 * - Sends HTTP POST to webhook URL
 * - Records delivery result
 * - Implements retry logic with exponential backoff
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { prisma } from '@email-gateway/database';
import axios, { AxiosError } from 'axios';
import { createHmac } from 'crypto';

interface WebhookJob {
  webhookId: string;
  eventType: string;
  payload: any;
}

@Injectable()
export class WebhookDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDeliveryService.name);
  private worker!: Worker<WebhookJob>;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = {
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
    };

    // Initialize webhook delivery worker
    this.worker = new Worker<WebhookJob>(
      'webhook-delivery',
      async (job: Job<WebhookJob>) => this.processWebhook(job),
      {
        connection: redisConfig,
        concurrency: 10, // Process 10 webhooks in parallel
        limiter: {
          max: 100, // Max 100 webhooks
          duration: 1000, // per second (100/s rate limit)
        },
      }
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.debug({
        message: 'Webhook delivered successfully',
        jobId: job.id,
        webhookId: job.data.webhookId,
        eventType: job.data.eventType,
      });
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      this.logger.error({
        message: 'Webhook delivery failed',
        jobId: job?.id,
        webhookId: job?.data?.webhookId,
        eventType: job?.data?.eventType,
        error: (error as Error).message,
        attempts: job?.attemptsMade,
      });
    });

    this.logger.log('Webhook delivery worker initialized');
  }

  async onModuleDestroy() {
    await this.worker.close();
    this.logger.log('Webhook delivery worker closed');
  }

  /**
   * Process a webhook delivery job
   */
  private async processWebhook(job: Job<WebhookJob>): Promise<void> {
    const { webhookId, eventType, payload } = job.data;
    const startTime = Date.now();

    // Get webhook configuration
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook) {
      this.logger.warn({
        message: 'Webhook not found, skipping',
        webhookId,
      });
      return;
    }

    if (!webhook.isActive) {
      this.logger.warn({
        message: 'Webhook not active, skipping',
        webhookId,
      });
      return;
    }

    // Create delivery record
    const delivery = await prisma.webhookDelivery.create({
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
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'SUCCESS',
          responseCode: response.status,
          responseBody: JSON.stringify(response.data).substring(0, 1000), // Truncate
          attempts: job.attemptsMade + 1,
          deliveredAt: new Date(),
        },
      });

      const durationMs = Date.now() - startTime;

      this.logger.log({
        message: 'Webhook delivered successfully',
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
      const isLastAttempt = job.attemptsMade >= 2; // 3 total attempts (0, 1, 2)

      // Extract error details
      const responseCode = isAxiosError ? error.response?.status : undefined;
      const errorMessage = isAxiosError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unknown error';

      // Update delivery record
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: isLastAttempt || !isRetryable ? 'FAILED' : 'RETRYING',
          responseCode,
          responseBody: errorMessage.substring(0, 1000),
          attempts: job.attemptsMade + 1,
          nextRetryAt: !isLastAttempt && isRetryable ? this.getNextRetryTime(job.attemptsMade + 1) : undefined,
        },
      });

      this.logger.warn({
        message: 'Webhook delivery failed',
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

      // Non-retryable errors (4xx) don't throw - just mark as failed
    }
  }

  /**
   * Generate HMAC-SHA256 signature for webhook payload
   */
  private generateSignature(payload: any, secret: string): string {
    const payloadString = JSON.stringify(payload);
    return createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');
  }

  /**
   * Determine if error is retryable
   *
   * Retryable errors:
   * - Network errors (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, ECONNRESET)
   * - 5xx server errors
   * - Rate limiting (429)
   *
   * Non-retryable errors:
   * - 4xx client errors (except 429)
   * - Invalid URL
   * - SSL/TLS errors
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
   *
   * Attempt 1: now + 5s
   * Attempt 2: now + 10s
   * Attempt 3: now + 20s
   */
  private getNextRetryTime(attempt: number): Date {
    const baseDelay = 5000; // 5 seconds
    const delay = baseDelay * Math.pow(2, attempt - 1);
    return new Date(Date.now() + delay);
  }
}
