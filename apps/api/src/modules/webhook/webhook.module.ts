/**
 * TASK-023: Webhook Module
 *
 * Module configuration for webhook system
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WebhookQueueService } from './webhook-queue.service';

@Module({
  imports: [ConfigModule],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookQueueService],
  exports: [WebhookService], // Export for use in email module
})
export class WebhookModule {}
