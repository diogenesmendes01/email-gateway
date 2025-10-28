/**
 * TASK-023: Webhook Service
 *
 * Business logic for webhook management:
 * - Create/Read/Delete webhooks
 * - Trigger webhook events
 * - Manage delivery logs
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { prisma } from '@email-gateway/database';
import { randomBytes } from 'crypto';
import { WebhookQueueService } from './webhook-queue.service';
import {
  CreateWebhookDto,
  CreateWebhookResponseDto,
  WebhookResponseDto,
  WebhookDeliveryResponseDto,
  WebhookEventType,
} from './dto/webhook.dto';
import { WebhookPayload, EmailEventData } from './types/webhook.types';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly webhookQueue: WebhookQueueService) {}

  /**
   * Create a new webhook configuration
   */
  async create(
    companyId: string,
    dto: CreateWebhookDto
  ): Promise<CreateWebhookResponseDto> {
    // Validate URL is HTTPS
    if (!dto.url.startsWith('https://')) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_WEBHOOK_URL',
          message: 'Webhook URL must use HTTPS protocol',
        },
      });
    }

    // Validate events array
    if (!dto.events || dto.events.length === 0) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_EVENTS',
          message: 'At least one event type must be specified',
        },
      });
    }

    // Generate secure secret for HMAC signing
    const secret = randomBytes(32).toString('hex');

    // Create webhook
    const webhook = await prisma.webhook.create({
      data: {
        companyId,
        url: dto.url,
        secret,
        events: dto.events,
        isActive: true,
      },
    });

    this.logger.log({
      message: 'Webhook created',
      webhookId: webhook.id,
      companyId,
      url: dto.url,
      events: dto.events,
    });

    // Return webhook with secret (only shown once!)
    return {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      secret, // IMPORTANT: Only returned on creation
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
    };
  }

  /**
   * List all webhooks for a company
   */
  async findAll(companyId: string): Promise<WebhookResponseDto[]> {
    const webhooks = await prisma.webhook.findMany({
      where: { companyId },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // IMPORTANT: Do not return secret
      },
      orderBy: { createdAt: 'desc' },
    });

    return webhooks;
  }

  /**
   * Get a specific webhook
   */
  async findOne(companyId: string, webhookId: string): Promise<WebhookResponseDto> {
    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, companyId },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // IMPORTANT: Do not return secret
      },
    });

    if (!webhook) {
      throw new NotFoundException({
        error: {
          code: 'WEBHOOK_NOT_FOUND',
          message: 'Webhook not found',
        },
      });
    }

    return webhook;
  }

  /**
   * Delete a webhook
   */
  async delete(companyId: string, webhookId: string): Promise<void> {
    const webhook = await prisma.webhook.findFirst({
      where: { id: webhookId, companyId },
    });

    if (!webhook) {
      throw new NotFoundException({
        error: {
          code: 'WEBHOOK_NOT_FOUND',
          message: 'Webhook not found',
        },
      });
    }

    await prisma.webhook.delete({ where: { id: webhookId } });

    this.logger.log({
      message: 'Webhook deleted',
      webhookId,
      companyId,
    });
  }

  /**
   * Send a test webhook event
   */
  async sendTestEvent(companyId: string, webhookId: string): Promise<void> {
    // Verify webhook exists and belongs to company
    const webhook = await this.findOne(companyId, webhookId);

    const payload: WebhookPayload = {
      type: WebhookEventType.WEBHOOK_TEST,
      timestamp: new Date().toISOString(),
      data: {
        outboxId: 'test-' + Date.now(),
        to: 'test@example.com',
        subject: 'Test Webhook',
        status: 'TEST',
        attempts: 1,
      },
    };

    await this.webhookQueue.enqueueWebhookDelivery(
      webhook.id,
      WebhookEventType.WEBHOOK_TEST,
      payload
    );

    this.logger.log({
      message: 'Test webhook enqueued',
      webhookId,
      companyId,
    });
  }

  /**
   * Get webhook delivery logs
   */
  async getDeliveries(
    companyId: string,
    webhookId: string,
    limit: number = 50
  ): Promise<WebhookDeliveryResponseDto[]> {
    // Verify webhook belongs to company
    await this.findOne(companyId, webhookId);

    const deliveries = await prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100), // Max 100
      select: {
        id: true,
        eventType: true,
        status: true,
        responseCode: true,
        attempts: true,
        deliveredAt: true,
        createdAt: true,
        // Do not return payload or responseBody (privacy)
      },
    });

    return deliveries;
  }

  /**
   * Trigger webhook for email event
   * Called by email service when email status changes
   */
  async triggerEmailEvent(
    companyId: string,
    eventType: WebhookEventType,
    emailData: EmailEventData
  ): Promise<void> {
    // Find all active webhooks subscribed to this event
    const webhooks = await prisma.webhook.findMany({
      where: {
        companyId,
        isActive: true,
        events: { has: eventType },
      },
    });

    if (webhooks.length === 0) {
      this.logger.debug({
        message: 'No webhooks subscribed to event',
        companyId,
        eventType,
      });
      return;
    }

    // Enqueue webhook delivery for each subscribed webhook
    const payload: WebhookPayload = {
      type: eventType,
      timestamp: new Date().toISOString(),
      data: emailData,
    };

    for (const webhook of webhooks) {
      try {
        await this.webhookQueue.enqueueWebhookDelivery(
          webhook.id,
          eventType,
          payload
        );

        this.logger.debug({
          message: 'Webhook delivery enqueued',
          webhookId: webhook.id,
          companyId,
          eventType,
        });
      } catch (error) {
        this.logger.error({
          message: 'Failed to enqueue webhook delivery',
          webhookId: webhook.id,
          companyId,
          eventType,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.logger.log({
      message: 'Email event triggered webhooks',
      companyId,
      eventType,
      webhookCount: webhooks.length,
    });
  }

  /**
   * Get webhook statistics for a company
   */
  async getStatistics(companyId: string) {
    const webhooks = await prisma.webhook.findMany({
      where: { companyId },
      select: {
        id: true,
        isActive: true,
      },
    });

    const totalWebhooks = webhooks.length;
    const activeWebhooks = webhooks.filter((w) => w.isActive).length;

    // Get delivery stats for last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const deliveries = await prisma.webhookDelivery.findMany({
      where: {
        webhook: { companyId },
        createdAt: { gte: oneDayAgo },
      },
      select: {
        status: true,
      },
    });

    const deliveryStats = {
      total: deliveries.length,
      success: deliveries.filter((d) => d.status === 'SUCCESS').length,
      failed: deliveries.filter((d) => d.status === 'FAILED').length,
      pending: deliveries.filter((d) => d.status === 'PENDING').length,
      retrying: deliveries.filter((d) => d.status === 'RETRYING').length,
    };

    return {
      webhooks: {
        total: totalWebhooks,
        active: activeWebhooks,
        inactive: totalWebhooks - activeWebhooks,
      },
      deliveries24h: deliveryStats,
      successRate:
        deliveryStats.total > 0
          ? (deliveryStats.success / deliveryStats.total) * 100
          : 0,
    };
  }
}
