/**
 * TASK-023: Webhook Controller
 *
 * REST API endpoints for webhook management:
 * - POST /v1/webhooks - Create webhook
 * - GET /v1/webhooks - List webhooks
 * - GET /v1/webhooks/:id - Get webhook details
 * - DELETE /v1/webhooks/:id - Delete webhook
 * - POST /v1/webhooks/:id/test - Send test webhook
 * - GET /v1/webhooks/:id/deliveries - Get delivery logs
 * - GET /v1/webhooks/stats - Get webhook statistics
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/auth.guard';
import { Company } from '../auth/decorators';
import { WebhookService } from './webhook.service';
import {
  CreateWebhookDto,
  CreateWebhookResponseDto,
  WebhookResponseDto,
  WebhookDeliveryResponseDto,
} from './dto/webhook.dto';

@Controller('v1/webhooks')
@UseGuards(ApiKeyGuard)
@ApiTags('Webhooks')
@ApiBearerAuth('X-API-Key')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  /**
   * Create a new webhook
   */
  @Post()
  @ApiOperation({
    summary: 'Create webhook',
    description:
      'Create a new webhook configuration to receive real-time event notifications',
  })
  @ApiResponse({
    status: 201,
    description: 'Webhook created successfully',
    type: CreateWebhookResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request (URL must be HTTPS)',
  })
  async createWebhook(
    @Company() companyId: string,
    @Body() dto: CreateWebhookDto
  ): Promise<CreateWebhookResponseDto> {
    return this.webhookService.create(companyId, dto);
  }

  /**
   * List all webhooks
   */
  @Get()
  @ApiOperation({
    summary: 'List webhooks',
    description: 'Get all webhook configurations for the company',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhooks retrieved successfully',
    type: [WebhookResponseDto],
  })
  async listWebhooks(@Company() companyId: string): Promise<WebhookResponseDto[]> {
    return this.webhookService.findAll(companyId);
  }

  /**
   * Get webhook details
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get webhook details',
    description: 'Get details of a specific webhook configuration',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook details retrieved successfully',
    type: WebhookResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Webhook not found',
  })
  async getWebhook(
    @Company() companyId: string,
    @Param('id') webhookId: string
  ): Promise<WebhookResponseDto> {
    return this.webhookService.findOne(companyId, webhookId);
  }

  /**
   * Delete webhook
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete webhook',
    description: 'Delete a webhook configuration',
  })
  @ApiResponse({
    status: 204,
    description: 'Webhook deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Webhook not found',
  })
  async deleteWebhook(
    @Company() companyId: string,
    @Param('id') webhookId: string
  ): Promise<void> {
    await this.webhookService.delete(companyId, webhookId);
  }

  /**
   * Send test webhook
   */
  @Post(':id/test')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Test webhook',
    description: 'Send a test event to the webhook URL to verify configuration',
  })
  @ApiResponse({
    status: 202,
    description: 'Test webhook enqueued for delivery',
  })
  @ApiResponse({
    status: 404,
    description: 'Webhook not found',
  })
  async testWebhook(
    @Company() companyId: string,
    @Param('id') webhookId: string
  ): Promise<{ message: string }> {
    await this.webhookService.sendTestEvent(companyId, webhookId);
    return { message: 'Test webhook enqueued for delivery' };
  }

  /**
   * Get webhook delivery logs
   */
  @Get(':id/deliveries')
  @ApiOperation({
    summary: 'Get delivery logs',
    description: 'Get webhook delivery attempts and results',
  })
  @ApiResponse({
    status: 200,
    description: 'Delivery logs retrieved successfully',
    type: [WebhookDeliveryResponseDto],
  })
  @ApiResponse({
    status: 404,
    description: 'Webhook not found',
  })
  async getDeliveries(
    @Company() companyId: string,
    @Param('id') webhookId: string
  ): Promise<WebhookDeliveryResponseDto[]> {
    return this.webhookService.getDeliveries(companyId, webhookId);
  }

  /**
   * Get webhook statistics
   */
  @Get('_/stats')
  @ApiOperation({
    summary: 'Get webhook statistics',
    description: 'Get webhook usage and delivery statistics for the company',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getStatistics(@Company() companyId: string) {
    return this.webhookService.getStatistics(companyId);
  }
}
