import {
  Controller,
  Post,
  Body,
  Req,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PostalWebhookValidatorService } from './postal-webhook-validator.service';
import { WebhookQueueService } from './webhook-queue.service';

/**
 * Postal Webhook Controller - TRACK 2
 * Semana 3-4: Webhooks Postal
 * Recebe webhooks do Postal MTA e enfileira para processamento
 */
@Controller('webhooks/postal')
export class PostalWebhookController {
  private readonly logger = new Logger(PostalWebhookController.name);

  constructor(
    private readonly validatorService: PostalWebhookValidatorService,
    private readonly queueService: WebhookQueueService,
  ) {}

  /**
   * Receber webhook do Postal
   * Valida assinatura e enfileira para processamento assíncrono
   */
  @Post()
  async handlePostalWebhook(@Body() payload: any, @Req() req: any) {
    try {
      // Log do payload recebido
      this.logger.debug(`Received Postal webhook: ${JSON.stringify(payload).substring(0, 200)}`);

      // Validar que o payload existe
      if (!payload) {
        throw new BadRequestException('Empty payload');
      }

      // Validar signature (HMAC)
      const signature = req.headers['x-postal-signature'] as string || '';
      const secret = process.env.POSTAL_WEBHOOK_SECRET || '';
      const isValid = this.validatorService.validateSignature(JSON.stringify(payload), signature, secret);
      if (!isValid) {
        this.logger.warn(`Invalid webhook signature`);
        throw new UnauthorizedException('Invalid webhook signature');
      }

      // Parse do evento
      const event = this.parsePostalEvent(payload);
      
      if (!event) {
        throw new BadRequestException('Unable to parse webhook event');
      }

      // Enfileirar para processamento (webhook delivery)
      // TODO: Implement proper webhook delivery queue
      // await this.queueService.enqueueWebhookDelivery(webhookId, event.type, payload);

      this.logger.log(
        `Webhook enqueued: ${event.type} for ${event.messageId}`
      );

      // Responder imediatamente (não esperar processamento)
      return { status: 'accepted', messageId: event.messageId };
    } catch (error) {
      this.logger.error(`Webhook processing failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Parse evento Postal em formato normalizado
   */
  private parsePostalEvent(payload: any): {
    type: 'delivery' | 'bounce' | 'complaint' | 'open' | 'click' | 'unknown';
    messageId: string;
    timestamp: Date;
    metadata: Record<string, any>;
  } | null {
    try {
      // Estrutura básica do webhook Postal
      const event = payload.event;
      const message = payload.message || {};
      const bounce = payload.bounce || {};
      const complaint = payload.complaint || {};

      const baseEvent = {
        messageId: message.id || payload.message_id || 'unknown',
        timestamp: new Date(payload.timestamp || Date.now()),
        metadata: payload,
      };

      // Classificar tipo de evento
      if (event === 'MessageDelivered') {
        return {
          ...baseEvent,
          type: 'delivery' as const,
        };
      }

      if (event === 'MessageBounced') {
        return {
          ...baseEvent,
          type: 'bounce' as const,
        };
      }

      if (event === 'MessageComplaint') {
        return {
          ...baseEvent,
          type: 'complaint' as const,
        };
      }

      if (event === 'MessageOpened') {
        return {
          ...baseEvent,
          type: 'open' as const,
        };
      }

      if (event === 'MessageClicked') {
        return {
          ...baseEvent,
          type: 'click' as const,
        };
      }

      // Unknown event type
      return {
        ...baseEvent,
        type: 'unknown' as const,
      };
    } catch (error) {
      this.logger.error(`Failed to parse Postal event: ${(error as Error).message}`);
      return null;
    }
  }
}
