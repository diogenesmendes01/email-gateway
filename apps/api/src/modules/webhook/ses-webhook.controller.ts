/**
 * TASK-024: SES Webhook Controller
 *
 * Receives AWS SNS notifications for SES events:
 * - Subscription confirmation (one-time setup)
 * - Bounce notifications
 * - Complaint notifications
 * - Delivery notifications
 *
 * SNS sends HTTP POST to /webhooks/ses with:
 * - Header: x-amz-sns-message-type
 * - Body: JSON with signature, message, etc.
 */

import {
  Controller,
  Post,
  Body,
  Headers,
  BadRequestException,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SESWebhookService } from './ses-webhook.service';

@Controller('webhooks/ses')
@ApiTags('AWS SES Webhooks')
export class SESWebhookController {
  private readonly logger = new Logger(SESWebhookController.name);

  constructor(private readonly sesWebhookService: SESWebhookService) {}

  /**
   * POST /webhooks/ses
   * Receive SNS notifications from AWS SES
   *
   * This endpoint is called by AWS SNS for:
   * 1. Subscription confirmation (one-time setup)
   * 2. SES event notifications (bounce, complaint, delivery)
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive AWS SNS notifications',
    description:
      'Webhook endpoint for AWS SNS notifications. Handles subscription confirmation and SES events.',
  })
  @ApiResponse({
    status: 200,
    description: 'SNS notification processed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid SNS signature or unknown message type',
  })
  async handleSNSNotification(
    @Body() body: any,
    @Headers('x-amz-sns-message-type') messageType: string
  ) {
    this.logger.log({
      message: 'Received SNS notification',
      messageType,
      topicArn: body.TopicArn,
      messageId: body.MessageId,
    });

    // Handle SNS subscription confirmation (one-time setup)
    if (messageType === 'SubscriptionConfirmation') {
      await this.sesWebhookService.confirmSubscription(body);
      return { message: 'Subscription confirmed successfully' };
    }

    // Handle SNS notification (SES events)
    if (messageType === 'Notification') {
      // Validate SNS signature for security
      const isValid = await this.sesWebhookService.validateSNSSignature(body);
      if (!isValid) {
        this.logger.error({
          message: 'Invalid SNS signature detected',
          messageId: body.MessageId,
        });
        throw new BadRequestException('Invalid SNS signature');
      }

      // Parse and enqueue SES event for processing
      await this.sesWebhookService.processSNSNotification(body);
      return { message: 'Event queued for processing' };
    }

    // Unknown message type
    this.logger.warn({
      message: 'Unknown SNS message type',
      messageType,
    });
    throw new BadRequestException(`Unknown SNS message type: ${messageType}`);
  }
}
