/**
 * TASK-024: SES Event Worker Entry Point
 *
 * Standalone worker for processing AWS SES events (bounces, complaints, deliveries)
 * Receives events from BullMQ queue (enqueued by API webhook endpoint)
 *
 * Usage:
 *   npm run dev:ses-worker    # Development
 *   npm run start:ses-worker  # Production
 */

import { Worker, Job } from 'bullmq';
import { PrismaClient } from '@email-gateway/database';
import { loadWorkerConfig } from './config/worker.config';

/**
 * SES Event Types
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
  };
  mail: {
    messageId: string;
    timestamp: string;
  };
}

interface SESComplaintEvent {
  eventType: 'Complaint';
  complaint: {
    complainedRecipients: Array<{
      emailAddress: string;
    }>;
    timestamp: string;
    feedbackType?: string;
  };
  mail: {
    messageId: string;
    timestamp: string;
  };
}

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
  };
}

type SESEvent = SESBounceEvent | SESComplaintEvent | SESDeliveryEvent;

/**
 * SES Event Worker Class
 */
class SESEventWorker {
  private worker?: Worker;
  private prisma: PrismaClient;
  private isShuttingDown = false;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Start the SES event worker
   */
  async start() {
    console.log('[SESEventWorker] Starting SES event processor...');

    const config = loadWorkerConfig();

    console.log('[SESEventWorker] Configuration:', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db,
      },
      concurrency: 10,
    });

    // Create BullMQ worker for ses-events queue
    this.worker = new Worker<SESEvent>(
      'ses-events',
      async (job: Job<SESEvent>) => this.processEvent(job),
      {
        connection: {
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db,
        },
        concurrency: 10, // Process 10 SES events in parallel
      }
    );

    // Event handlers
    this.worker.on('completed', (job: Job) => {
      console.log(`[SESEventWorker] ✓ Job completed: ${job.id} (${job.data.eventType})`);
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      console.error(
        `[SESEventWorker] ✗ Job failed: ${job?.id} (attempt ${job?.attemptsMade})`,
        {
          eventType: job?.data?.eventType,
          error: error.message,
        }
      );
    });

    this.worker.on('error', (err: Error) => {
      console.error('[SESEventWorker] Worker error:', err);
    });

    // Setup graceful shutdown
    this.setupGracefulShutdown();

    console.log('[SESEventWorker] ✓ Worker started successfully');
  }

  /**
   * Process SES event based on type
   */
  private async processEvent(job: Job<SESEvent>): Promise<void> {
    const sesEvent = job.data;

    console.log(`[SESEventWorker] Processing ${sesEvent.eventType} event`, {
      jobId: job.id,
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
        console.warn(`[SESEventWorker] Unknown event type: ${(sesEvent as any).eventType}`);
    }
  }

  /**
   * Process Bounce Event
   */
  private async processBounce(event: SESBounceEvent): Promise<void> {
    const { bounceType, bounceSubType, bouncedRecipients } = event.bounce;
    const { messageId } = event.mail;

    // Find EmailLog by SES Message ID
    const emailLog = await this.prisma.emailLog.findUnique({
      where: { sesMessageId: messageId },
    });

    if (!emailLog) {
      console.warn(`[SESEventWorker] EmailLog not found for bounce: ${messageId}`);
      return;
    }

    // Update EmailLog with bounce info
    await this.prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        bounceType,
        bounceSubtype: bounceSubType,
      },
    });

    // Create EmailEvent
    await this.prisma.emailEvent.create({
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

    // Add hard bounces to blocklist
    if (bounceType === 'Permanent') {
      for (const recipient of bouncedRecipients) {
        await this.prisma.recipientBlocklist.upsert({
          where: {
            companyId_email: {
              companyId: emailLog.companyId,
              email: recipient.emailAddress,
            },
          },
          create: {
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
          },
          update: {
            reason: 'hard_bounce',
            bounceType,
            bounceSubtype: bounceSubType,
            metadata: {
              status: recipient.status,
              action: recipient.action,
              diagnosticCode: recipient.diagnosticCode,
            },
          },
        });

        console.warn(`[SESEventWorker] ⚠️ Hard bounce blocked: ${recipient.emailAddress}`);
      }
    }

    console.log(`[SESEventWorker] Bounce processed: ${bounceType} (${bouncedRecipients.length} recipients)`);
  }

  /**
   * Process Complaint Event (CRITICAL - Spam Reports)
   */
  private async processComplaint(event: SESComplaintEvent): Promise<void> {
    const { complainedRecipients, feedbackType } = event.complaint;
    const { messageId } = event.mail;

    // Find EmailLog by SES Message ID
    const emailLog = await this.prisma.emailLog.findUnique({
      where: { sesMessageId: messageId },
    });

    if (!emailLog) {
      console.warn(`[SESEventWorker] EmailLog not found for complaint: ${messageId}`);
      return;
    }

    // Update EmailLog
    await this.prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        complaintFeedbackType: feedbackType,
      },
    });

    // Create EmailEvent
    await this.prisma.emailEvent.create({
      data: {
        emailLogId: emailLog.id,
        type: 'COMPLAINED',
        metadata: {
          feedbackType,
          complainedRecipients,
        },
      },
    });

    // Add ALL complained recipients to blocklist (CRITICAL)
    for (const recipient of complainedRecipients) {
      await this.prisma.recipientBlocklist.upsert({
        where: {
          companyId_email: {
            companyId: emailLog.companyId,
            email: recipient.emailAddress,
          },
        },
        create: {
          companyId: emailLog.companyId,
          email: recipient.emailAddress,
          reason: 'complaint',
          sesMessageId: messageId,
          metadata: { feedbackType },
        },
        update: {
          reason: 'complaint',
          metadata: { feedbackType },
        },
      });

      console.error(`[SESEventWorker] 🚨 SPAM COMPLAINT - Blocked: ${recipient.emailAddress}`);
    }

    console.error(`[SESEventWorker] 🚨 Complaint processed: ${complainedRecipients.length} recipients blocked`);
  }

  /**
   * Process Delivery Event
   */
  private async processDelivery(event: SESDeliveryEvent): Promise<void> {
    const { recipients, timestamp, processingTimeMillis } = event.delivery;
    const { messageId } = event.mail;

    // Find EmailLog by SES Message ID
    const emailLog = await this.prisma.emailLog.findUnique({
      where: { sesMessageId: messageId },
    });

    if (!emailLog) {
      // Delivery events may arrive for emails not in our system
      return;
    }

    // Update EmailLog
    await this.prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        deliveryTimestamp: new Date(timestamp),
      },
    });

    // Create EmailEvent
    await this.prisma.emailEvent.create({
      data: {
        emailLogId: emailLog.id,
        type: 'DELIVERED',
        metadata: {
          recipients,
          processingTimeMillis,
        },
      },
    });

    console.log(`[SESEventWorker] Delivery processed: ${recipients.length} recipients (${processingTimeMillis}ms)`);
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown() {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        console.log('[SESEventWorker] Shutdown already in progress...');
        return;
      }

      this.isShuttingDown = true;
      console.log(`[SESEventWorker] Received ${signal}, starting graceful shutdown...`);

      try {
        if (this.worker) {
          console.log('[SESEventWorker] Pausing worker...');
          await this.worker.pause();

          console.log('[SESEventWorker] Waiting for active jobs to complete (max 30s)...');
          const shutdownTimeout = 30000;
          const startTime = Date.now();

          while (Date.now() - startTime < shutdownTimeout) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            console.log('[SESEventWorker] Waiting for active jobs...');
          }

          console.log('[SESEventWorker] Closing worker...');
          await this.worker.close();
        }

        console.log('[SESEventWorker] Closing Prisma connection...');
        await this.prisma.$disconnect();

        console.log('[SESEventWorker] ✓ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('[SESEventWorker] Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      console.error('[SESEventWorker] Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      console.error('[SESEventWorker] Unhandled rejection:', reason);
      shutdown('unhandledRejection');
    });
  }
}

// Initialize and start worker
const worker = new SESEventWorker();

worker.start().catch((error) => {
  console.error('[SESEventWorker] Failed to start worker:', error);
  process.exit(1);
});
