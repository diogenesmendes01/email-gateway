/**
 * TASK-023: Webhook System DTOs
 *
 * Data Transfer Objects for webhook management API
 */

import { IsUrl, IsArray, IsEnum, IsNotEmpty, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Webhook event types
 *
 * These events trigger webhook notifications to client endpoints
 */
export enum WebhookEventType {
  EMAIL_SENT = 'email.sent',
  EMAIL_FAILED = 'email.failed',
  EMAIL_BOUNCED = 'email.bounced',
  EMAIL_COMPLAINED = 'email.complained',
  EMAIL_DELIVERED = 'email.delivered',
  WEBHOOK_TEST = 'webhook.test',
}

/**
 * DTO for creating a new webhook
 */
export class CreateWebhookDto {
  @ApiProperty({
    description: 'HTTPS URL to receive webhook events',
    example: 'https://api.example.com/webhooks/email-gateway',
  })
  @IsUrl({ protocols: ['https'], require_tld: true })
  @IsNotEmpty()
  url!: string;

  @ApiProperty({
    description: 'Array of event types to subscribe to',
    enum: WebhookEventType,
    isArray: true,
    example: [WebhookEventType.EMAIL_SENT, WebhookEventType.EMAIL_FAILED],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(WebhookEventType, { each: true })
  @IsNotEmpty()
  events!: WebhookEventType[];
}

/**
 * Response DTO for webhook creation
 */
export class CreateWebhookResponseDto {
  @ApiProperty({ description: 'Webhook ID' })
  id!: string;

  @ApiProperty({ description: 'Webhook URL' })
  url!: string;

  @ApiProperty({ description: 'Subscribed event types' })
  events!: string[];

  @ApiProperty({
    description: 'Secret key for HMAC-SHA256 verification (shown only once)',
  })
  secret!: string;

  @ApiProperty({ description: 'Webhook active status' })
  isActive!: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: Date;
}

/**
 * Response DTO for webhook details (without secret)
 */
export class WebhookResponseDto {
  @ApiProperty({ description: 'Webhook ID' })
  id!: string;

  @ApiProperty({ description: 'Webhook URL' })
  url!: string;

  @ApiProperty({ description: 'Subscribed event types' })
  events!: string[];

  @ApiProperty({ description: 'Webhook active status' })
  isActive!: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: Date;
}

/**
 * Response DTO for webhook delivery log
 */
export class WebhookDeliveryResponseDto {
  @ApiProperty({ description: 'Delivery ID' })
  id!: string;

  @ApiProperty({ description: 'Event type' })
  eventType!: string;

  @ApiProperty({ description: 'Delivery status' })
  status!: string;

  @ApiProperty({ description: 'HTTP response code', nullable: true })
  responseCode!: number | null;

  @ApiProperty({ description: 'Number of delivery attempts' })
  attempts!: number;

  @ApiProperty({ description: 'Delivery timestamp', nullable: true })
  deliveredAt!: Date | null;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: Date;
}
