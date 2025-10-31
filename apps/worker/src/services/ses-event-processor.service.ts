/**
 * TASK-024: SES Event Processor Service
 *
 * BullMQ worker that processes SES events from AWS SNS:
 * - Bounce events (Permanent, Temporary, Transient)
 * - Complaint events (spam reports)
 * - Delivery events (successful deliveries)
 *
 * Actions:
 * - Updates EmailLog with event details
 * - Creates EmailEvent records for tracking
 * - Adds hard bounces and complaints to blocklist
 * - Records metrics for monitoring
 *
 * Critical for sender reputation management:
 * - Hard bounces must be blocked immediately
 * - Complaints (spam) are critical - AWS suspends accounts if rate > 0.5%
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { prisma } from '@email-gateway/database';

/**
 * SES Bounce Event Structure
 * https://docs.aws.amazon.com/ses/latest/dg/notification-contents.html#bounce-object
 */
interface SESBounceEvent {
  eventType: 'Bounce';
  bounce: {
    bounceType: 'Permanent' | 'Temporary' | 'Transient';
    bounceSubType: string;
    bouncedRecipients: Array<{
      emailAddress: string;
      status: string;
      action: string;
      diagnosticCode?: string;
    }>;
    timestamp: string;
    feedbackId: string;
  };
  mail: {
    messageId: string; // SES Message ID
    timestamp: string;
    source: string;
    destination: string[];
  };
}

/**
 * SES Complaint Event Structure
 * https://docs.aws.amazon.com/ses/latest/dg/notification-contents.html#complaint-object
 */
interface SESComplaintEvent {
  eventType: 'Complaint';
  complaint: {
    complainedRecipients: Array<{
      emailAddress: string;
    }>;
    timestamp: string;
    feedbackId: string;
    feedbackType?: string; // 'abuse', 'fraud', 'virus', etc.
    userAgent?: string;
  };
  mail: {
    messageId: string;
    timestamp: string;
    source: string;
    destination: string[];
  };
}

/**
 * SES Delivery Event Structure
 * https://docs.aws.amazon.com/ses/latest/dg/notification-contents.html#delivery-object
 */
interface SESDeliveryEvent {
  eventType: 'Delivery';
  delivery: {
    timestamp: string;
    recipients: string[];
    processingTimeMillis: number;
    smtpResponse: string;
  };
  mail: {
    messageId: string;
    timestamp: string;
    source: string;
    destination: string[];
  };
}

type SESEvent = SESBounceEvent | SESComplaintEvent | SESDeliveryEvent;

@Injectable()
export class SESEventProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SESEventProcessorService.name);
  private worker!: Worker;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = {
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
    };

    // Create BullMQ worker for SES events queue
    this.worker = new Worker(
      'ses-events',
      async (job: Job<SESEvent>) => this.processEvent(job),
      {
        connection: redisConfig,
        concurrency: 10, // Process 10 events in parallel
      }
    );

    this.worker.on('completed', (job: Job) => {
      this.logger.log({
        message: 'SES event processed successfully',
        jobId: job.id,
        eventType: job.data.eventType,
      });
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      this.logger.error({
        message: 'SES event processing failed',
        jobId: job?.id,
        eventType: job?.data?.eventType,
        error: (error as Error).message,
        attempts: job?.attemptsMade,
      });
    });

    this.logger.log('SES event processor worker initialized');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    this.logger.log('SES event processor worker closed');
  }

  /**
   * Process SES event based on type
   */
  private async processEvent(job: Job<SESEvent>): Promise<void> {
    const sesEvent = job.data;

    this.logger.log({
      message: 'Processing SES event',
      jobId: job.id,
      eventType: sesEvent.eventType,
      sesMessageId: sesEvent.mail?.messageId,
    });

    switch (sesEvent.eventType) {
      case 'Bounce':
        await this.processBounce(sesEvent as SESBounceEvent);
        break;
      case 'Complaint':
        await this.processComplaint(sesEvent as SESComplaintEvent);
        break;
      case 'Delivery':
        await this.processDelivery(sesEvent as SESDeliveryEvent);
        break;
      default:
        this.logger.warn({
          message: 'Unknown SES event type',
          eventType: (sesEvent as any).eventType,
        });
    }
  }

  /**
   * Process Bounce Event
   *
   * Bounce types:
   * - Permanent: Hard bounce (invalid email, domain doesn't exist) → BLOCK
   * - Temporary: Soft bounce (mailbox full, temporary server issues) → RETRY
   * - Transient: Transient issue (timeout, connection error) → RETRY
   */
  private async processBounce(event: SESBounceEvent): Promise<void> {
    const { bounceType, bounceSubType, bouncedRecipients } = event.bounce;
    const { messageId } = event.mail;

    this.logger.log({
      message: 'Processing bounce event',
      bounceType,
      bounceSubType,
      recipientsCount: bouncedRecipients.length,
      sesMessageId: messageId,
    });

    // Find EmailLog by SES Message ID
    const emailLog = await prisma.emailLog.findUnique({
      where: { sesMessageId: messageId },
    });

    if (!emailLog) {
      this.logger.warn({
        message: 'EmailLog not found for bounce event',
        sesMessageId: messageId,
      });
      return;
    }

    // Update EmailLog with bounce information
    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        bounceType,
        bounceSubtype: bounceSubType,
      },
    });

    // Create EmailEvent for tracking
    await prisma.emailEvent.create({
      data: {
        emailLogId: emailLog.id,
        type: 'BOUNCED',
        metadata: {
          bounceType,
          bounceSubType,
          bouncedRecipients,
        },
      },
    });

    // CRITICAL: Hard bounces (Permanent) must be added to blocklist
    // to prevent future sends and protect sender reputation
    if (bounceType === 'Permanent') {
      for (const recipient of bouncedRecipients) {
        await this.addToBlocklist({
          companyId: emailLog.companyId,
          email: recipient.emailAddress,
          reason: 'hard_bounce',
          bounceType,
          bounceSubtype: bounceSubType,
          sesMessageId: messageId,
          metadata: {
            status: recipient.status,
            action: recipient.action,
            diagnosticCode: recipient.diagnosticCode,
          },
        });

        this.logger.warn({
          message: '⚠️ Email added to blocklist (hard bounce)',
          email: recipient.emailAddress,
          companyId: emailLog.companyId,
          bounceType,
          bounceSubType,
        });
      }
    }

    this.logger.log({
      message: 'Bounce event processed successfully',
      bounceType,
      recipientsCount: bouncedRecipients.length,
      blocked: bounceType === 'Permanent',
    });
  }

  /**
   * Process Complaint Event (CRITICAL)
   *
   * Spam complaints are the most critical events:
   * - AWS suspends accounts if complaint rate > 0.5%
   * - Complained recipients MUST be immediately blocked
   * - Never send to these addresses again
   */
  private async processComplaint(event: SESComplaintEvent): Promise<void> {
    const { complainedRecipients, feedbackType } = event.complaint;
    const { messageId } = event.mail;

    this.logger.error({
      message: '🚨 SPAM COMPLAINT RECEIVED',
      feedbackType,
      recipientsCount: complainedRecipients.length,
      sesMessageId: messageId,
    });

    // Find EmailLog by SES Message ID
    const emailLog = await prisma.emailLog.findUnique({
      where: { sesMessageId: messageId },
    });

    if (!emailLog) {
      this.logger.warn({
        message: 'EmailLog not found for complaint event',
        sesMessageId: messageId,
      });
      return;
    }

    // Update EmailLog with complaint information
    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        complaintFeedbackType: feedbackType,
      },
    });

    // Create EmailEvent for tracking
    await prisma.emailEvent.create({
      data: {
        emailLogId: emailLog.id,
        type: 'COMPLAINED',
        metadata: {
          feedbackType,
          complainedRecipients,
        },
      },
    });

    // CRITICAL: Add ALL complained recipients to blocklist immediately
    // This protects sender reputation and prevents AWS account suspension
    for (const recipient of complainedRecipients) {
      await this.addToBlocklist({
        companyId: emailLog.companyId,
        email: recipient.emailAddress,
        reason: 'complaint',
        sesMessageId: messageId,
        metadata: { feedbackType },
      });

      this.logger.error({
        message: '🚨 SPAM COMPLAINT - Email permanently blocked',
        email: recipient.emailAddress,
        companyId: emailLog.companyId,
        feedbackType,
      });
    }

    this.logger.error({
      message: 'Complaint event processed - recipients blocked',
      recipientsCount: complainedRecipients.length,
    });
  }

  /**
   * Process Delivery Event
   *
   * Confirms successful email delivery to recipient's mailbox.
   * This is the final positive status for an email.
   */
  private async processDelivery(event: SESDeliveryEvent): Promise<void> {
    const { recipients, timestamp, processingTimeMillis, smtpResponse } = event.delivery;
    const { messageId } = event.mail;

    this.logger.log({
      message: 'Processing delivery event',
      recipientsCount: recipients.length,
      processingTimeMs: processingTimeMillis,
      sesMessageId: messageId,
    });

    // Find EmailLog by SES Message ID
    const emailLog = await prisma.emailLog.findUnique({
      where: { sesMessageId: messageId },
    });

    if (!emailLog) {
      // Delivery events may arrive for emails we don't track (e.g., old emails)
      // This is not an error, just log and skip
      return;
    }

    // Update EmailLog with delivery timestamp
    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        deliveryTimestamp: new Date(timestamp),
      },
    });

    // Create EmailEvent for tracking
    await prisma.emailEvent.create({
      data: {
        emailLogId: emailLog.id,
        type: 'DELIVERED',
        metadata: {
          recipients,
          processingTimeMillis,
          smtpResponse,
        },
      },
    });

    this.logger.log({
      message: 'Delivery event processed successfully',
      recipientsCount: recipients.length,
      processingTimeMs: processingTimeMillis,
    });
  }

  /**
   * Add email to blocklist
   *
   * Uses upsert to handle cases where email is already blocked.
   * Updates existing records with latest bounce/complaint info.
   */
  private async addToBlocklist(data: {
    companyId: string;
    email: string;
    reason: string;
    bounceType?: string;
    bounceSubtype?: string;
    sesMessageId: string;
    metadata?: any;
  }): Promise<void> {
    await prisma.recipientBlocklist.upsert({
      where: {
        companyId_email: {
          companyId: data.companyId,
          email: data.email,
        },
      },
      create: {
        companyId: data.companyId,
        email: data.email,
        reason: data.reason,
        bounceType: data.bounceType,
        bounceSubtype: data.bounceSubtype,
        sesMessageId: data.sesMessageId,
        metadata: data.metadata,
      },
      update: {
        reason: data.reason,
        bounceType: data.bounceType,
        bounceSubtype: data.bounceSubtype,
        metadata: data.metadata,
        // blockedAt is NOT updated - keeps original block date
      },
    });
  }
}
