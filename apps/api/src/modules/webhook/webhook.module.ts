/**
 * TASK-023: Webhook Module
 * TASK-024: SES Event Processing
 *
 * Module configuration for webhook system:
 * - Client webhooks (TASK-023)
 * - AWS SES event webhooks (TASK-024)
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WebhookQueueService } from './webhook-queue.service';
import { SESWebhookController } from './ses-webhook.controller'; // TASK-024
import { SESWebhookService } from './ses-webhook.service'; // TASK-024

@Module({
  imports: [ConfigModule],
  controllers: [
    WebhookController,
    SESWebhookController, // TASK-024
  ],
  providers: [
    WebhookService,
    WebhookQueueService,
    SESWebhookService, // TASK-024
  ],
  exports: [WebhookService, SESWebhookService], // Export for use in email module
})
export class WebhookModule {}
