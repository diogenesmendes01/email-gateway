import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PostalWebhookController } from './postal-webhook.controller';
import { PostalWebhookValidatorService } from './postal-webhook-validator.service';
import { WebhookQueueService } from './webhook-queue.service';
import { WebhookIngestQueueService } from './webhook-ingest-queue.service';

/**
 * Webhook Module
 * Handles incoming webhook events from different email providers
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'webhook-ingest',
    }),
  ],
  controllers: [PostalWebhookController],
  providers: [PostalWebhookValidatorService, WebhookQueueService, WebhookIngestQueueService],
  exports: [PostalWebhookValidatorService, WebhookQueueService, WebhookIngestQueueService],
})
export class WebhookModule {}
