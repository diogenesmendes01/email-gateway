import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DSNParserService } from './services/dsn-parser.service';
import { ARFParserService } from './services/arf-parser.service';
import { BounceClassifierService } from './services/bounce-classifier.service';
import { PrismaClient } from '@email-gateway/database';

type PrismaService = PrismaClient;

export interface WebhookIngestJobData {
  provider: 'postal' | 'mailu' | 'haraka' | 'ses';
  event: {
    type: 'delivery' | 'bounce' | 'complaint' | 'open' | 'click' | 'unknown';
    messageId: string;
    timestamp: Date;
    metadata: Record<string, any>;
  };
  rawPayload: Record<string, any>;
  receivedAt: Date;
}

/**
 * Webhook Ingest Worker - TRACK 2
 * Semana 3-4: Webhooks Postal
 * Processa eventos de webhooks (bounce, complaint, delivery, open, click)
 * Atualiza email_logs e dispara ações (supressão, reputação, client webhooks)
 */
export class WebhookIngestWorker {
  private readonly logger = new Logger(WebhookIngestWorker.name);

  constructor(
    private readonly dsnParser: DSNParserService,
    private readonly arfParser: ARFParserService,
    private readonly bounceClassifier: BounceClassifierService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Processar webhook de qualquer provider
   */
  async process(job: Job<WebhookIngestJobData>) {
    try {
      this.logger.log(
        `Processing webhook [${job.id}]: ${job.data.event.type} from ${job.data.provider}`
      );

      switch (job.data.provider) {
        case 'postal':
          return await this.processPostalWebhook(job.data);
        case 'mailu':
          return await this.processMailuWebhook(job.data);
        case 'haraka':
          return await this.processHarakaWebhook(job.data);
        default:
          this.logger.warn(`Unknown provider: ${job.data.provider}`);
          return { status: 'skipped', reason: 'unknown_provider' };
      }
    } catch (error) {
      this.logger.error(`Webhook processing failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Processar webhook do Postal
   */
  private async processPostalWebhook(data: WebhookIngestJobData) {
    const { event, rawPayload } = data;
    const { messageId, type, metadata } = event;

    // 1. Encontrar email_log
    const emailLog = await this.prisma.emailLog.findUnique({
      where: { sesMessageId: messageId },
      include: { company: true, outbox: true },
    });

    if (!emailLog) {
      this.logger.warn(`Email log not found for message: ${messageId}`);
      return { status: 'skipped', reason: 'email_log_not_found' };
    }

    // 2. Processar por tipo de evento
    switch (type) {
      case 'delivery':
        return await this.processDeliveryEvent(emailLog, metadata);
      case 'bounce':
        return await this.processBounceEvent(emailLog, metadata, rawPayload);
      case 'complaint':
        return await this.processComplaintEvent(emailLog, metadata, rawPayload);
      case 'open':
        return await this.processOpenEvent(emailLog, metadata);
      case 'click':
        return await this.processClickEvent(emailLog, metadata);
      default:
        this.logger.warn(`Unknown event type: ${type}`);
        return { status: 'skipped', reason: 'unknown_event_type' };
    }
  }

  /**
   * Processar evento de entrega (delivery)
   */
  private async processDeliveryEvent(emailLog: any, metadata: Record<string, any>) {
    try {
      // Atualizar email_log com informações de entrega
      await this.prisma.emailLog.update({
        where: { id: emailLog.id },
        data: {
          status: 'SENT',
          deliveryTimestamp: new Date(metadata.timestamp || Date.now()),
        },
      });

      // Criar evento
      await this.prisma.emailEvent.create({
        data: {
          emailLogId: emailLog.id,
          type: 'DELIVERED',
          metadata,
        },
      });

      this.logger.log(`Delivery confirmed for ${emailLog.to}`);
      return { status: 'processed', type: 'delivery' };
    } catch (error) {
      this.logger.error(`Failed to process delivery: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Processar evento de bounce (DSN)
   */
  private async processBounceEvent(
    emailLog: any,
    metadata: Record<string, any>,
    rawPayload: Record<string, any>
  ) {
    try {
      // 1. Parse DSN
      const dsnRaw = rawPayload.bounce?.message || JSON.stringify(rawPayload);
      const dsn = this.dsnParser.parseDSN(dsnRaw);
      const classification = this.dsnParser.classifyBounce(dsn);

      // 2. Extrair informações de bounce
      const bounceType = metadata.bounce?.type || 'Transient';
      const bounceSubtype = metadata.bounce?.subtype || 'Undetermined';

      // 3. Atualizar email_log
      await this.prisma.emailLog.update({
        where: { id: emailLog.id },
        data: {
          status: 'FAILED',
          bounceType: bounceType,
          bounceSubtype: bounceSubtype,
          errorCode: classification.type,
          errorReason: classification.reason,
        },
      });

      // 4. Criar evento
      await this.prisma.emailEvent.create({
        data: {
          emailLogId: emailLog.id,
          type: 'BOUNCED',
          metadata: { ...metadata, classification: JSON.parse(JSON.stringify(classification)) },
        },
      });

      // 5. Adicionar à supressão se hard bounce
      if (classification.shouldSuppress) {
        await this.prisma.suppression.upsert({
          where: {
            companyId_email: {
              companyId: emailLog.companyId,
              email: emailLog.to,
            },
          },
          create: {
            companyId: emailLog.companyId,
            email: emailLog.to,
            domain: emailLog.to.split('@')[1],
            reason: 'HARD_BOUNCE',
            source: 'bounce',
            bounceType: bounceType,
            diagnosticCode: classification.reason,
          },
          update: {
            reason: 'HARD_BOUNCE',
            source: 'bounce',
            bounceType: bounceType,
            diagnosticCode: classification.reason,
            suppressedAt: new Date(),
          },
        });

        this.logger.log(`Email ${emailLog.to} added to suppressions (hard bounce)`);
      }

      // 6. Enviar webhook ao cliente (se configurado)
      await this.triggerClientWebhook(emailLog, 'bounce', {
        email: emailLog.to,
        bounceType: bounceType,
        bounceSubtype: bounceSubtype,
        reason: classification.reason,
      });

      this.logger.log(
        `Bounce processed for ${emailLog.to} (type: ${classification.type})`
      );
      return { status: 'processed', type: 'bounce', suppressed: classification.shouldSuppress };
    } catch (error) {
      this.logger.error(`Failed to process bounce: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Processar evento de complaint (ARF)
   */
  private async processComplaintEvent(
    emailLog: any,
    metadata: Record<string, any>,
    rawPayload: Record<string, any>
  ) {
    try {
      // 1. Parse ARF
      const arfRaw = rawPayload.complaint?.message || JSON.stringify(rawPayload);
      const arf = this.arfParser.parseARF(arfRaw);
      const complaint = this.arfParser.extractComplaint(arf);

      // 2. Extrair tipo de complaint
      const feedbackType = metadata.complaint?.type || arf.feedbackType || 'abuse';

      // 3. Atualizar email_log
      await this.prisma.emailLog.update({
        where: { id: emailLog.id },
        data: {
          status: 'FAILED',
          complaintFeedbackType: feedbackType,
          errorCode: 'COMPLAINT',
          errorReason: `Complaint: ${feedbackType}`,
        },
      });

      // 4. Criar evento
      await this.prisma.emailEvent.create({
        data: {
          emailLogId: emailLog.id,
          type: 'COMPLAINED',
          metadata: { ...metadata, complaint: JSON.parse(JSON.stringify(complaint)) },
        },
      });

      // 5. Adicionar à supressão
      await this.prisma.suppression.upsert({
        where: {
          companyId_email: {
            companyId: emailLog.companyId,
            email: emailLog.to,
          },
        },
        create: {
          companyId: emailLog.companyId,
          email: emailLog.to,
          domain: emailLog.to.split('@')[1],
          reason: 'SPAM_COMPLAINT',
          source: 'complaint',
          diagnosticCode: feedbackType,
        },
        update: {
          reason: 'SPAM_COMPLAINT',
          source: 'complaint',
          diagnosticCode: feedbackType,
          suppressedAt: new Date(),
        },
      });

      this.logger.log(`Email ${emailLog.to} added to suppressions (complaint)`);

      // 6. Enviar webhook ao cliente
      await this.triggerClientWebhook(emailLog, 'complaint', {
        email: emailLog.to,
        feedbackType: feedbackType,
        sourceIP: complaint.sourceIP,
      });

      this.logger.log(`Complaint processed for ${emailLog.to} (type: ${feedbackType})`);
      return { status: 'processed', type: 'complaint', feedbackType };
    } catch (error) {
      this.logger.error(`Failed to process complaint: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Processar evento de abertura (open)
   */
  private async processOpenEvent(emailLog: any, metadata: Record<string, any>) {
    try {
      const trackingId = metadata.tracking_id || `open-${emailLog.id}`;

      // Encontrar ou criar tracking
      const tracking = await this.prisma.emailTracking.upsert({
        where: { trackingId },
        create: {
          emailLogId: emailLog.id,
          trackingId,
          openedAt: new Date(),
          openCount: 1,
          userAgent: metadata.user_agent,
          ipAddress: metadata.ip_address,
        },
        update: {
          openedAt: new Date(),
          openCount: { increment: 1 },
          userAgent: metadata.user_agent,
          ipAddress: metadata.ip_address,
        },
      });

      // Enviar webhook ao cliente
      await this.triggerClientWebhook(emailLog, 'open', {
        email: emailLog.to,
        openCount: tracking.openCount,
        userAgent: metadata.user_agent,
        ipAddress: metadata.ip_address,
      });

      this.logger.log(`Open recorded for ${emailLog.to}`);
      return { status: 'processed', type: 'open' };
    } catch (error) {
      this.logger.error(`Failed to process open: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Processar evento de clique (click)
   */
  private async processClickEvent(emailLog: any, metadata: Record<string, any>) {
    try {
      const trackingId = metadata.tracking_id || `click-${emailLog.id}`;
      const clickUrl = metadata.url;

      // Encontrar tracking existente
      const existingTracking = await this.prisma.emailTracking.findUnique({
        where: { trackingId },
      });

      // Criar ou atualizar tracking
      const tracking = await this.prisma.emailTracking.upsert({
        where: { trackingId },
        create: {
          emailLogId: emailLog.id,
          trackingId,
          clickedAt: new Date(),
          clickCount: 1,
          clickedUrls: [{ url: clickUrl, timestamp: new Date() }],
          userAgent: metadata.user_agent,
          ipAddress: metadata.ip_address,
        },
        update: {
          clickedAt: new Date(),
          clickCount: { increment: 1 },
          clickedUrls: this.appendClickUrl(
            (existingTracking?.clickedUrls as any) || [],
            clickUrl
          ),
          userAgent: metadata.user_agent,
          ipAddress: metadata.ip_address,
        },
      });

      // Enviar webhook ao cliente
      await this.triggerClientWebhook(emailLog, 'click', {
        email: emailLog.to,
        url: clickUrl,
        clickCount: tracking.clickCount,
        userAgent: metadata.user_agent,
        ipAddress: metadata.ip_address,
      });

      this.logger.log(`Click recorded for ${emailLog.to}: ${clickUrl}`);
      return { status: 'processed', type: 'click', url: clickUrl };
    } catch (error) {
      this.logger.error(`Failed to process click: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Processar webhook do Mailu
   */
  private async processMailuWebhook(data: WebhookIngestJobData) {
    this.logger.warn('Mailu webhook processing not implemented yet');
    return { status: 'skipped', reason: 'not_implemented' };
  }

  /**
   * Processar webhook do Haraka
   */
  private async processHarakaWebhook(data: WebhookIngestJobData) {
    this.logger.warn('Haraka webhook processing not implemented yet');
    return { status: 'skipped', reason: 'not_implemented' };
  }

  /**
   * Disparar webhook do cliente
   */
  private async triggerClientWebhook(
    emailLog: any,
    eventType: string,
    payload: Record<string, any>
  ) {
    try {
      // Encontrar webhooks da empresa
      const webhooks = await this.prisma.webhook.findMany({
        where: {
          companyId: emailLog.companyId,
          isActive: true,
          events: { has: eventType },
        },
      });

      for (const webhook of webhooks) {
        // Enfileirar para envio (implementar webhook delivery worker)
        this.logger.log(
          `Triggering webhook for ${emailLog.companyId}: ${eventType}`
        );
      }
    } catch (error) {
      this.logger.error(`Failed to trigger client webhook: ${(error as Error).message}`);
    }
  }

  /**
   * Adicionar URL de clique à lista
   */
  private appendClickUrl(urls: any[], newUrl: string): any[] {
    if (!Array.isArray(urls)) {
      urls = [];
    }

    const clickEntry = { url: newUrl, timestamp: new Date() };
    return [...urls, clickEntry];
  }
}
