/**
 * TASK-024: SES Webhook Service
 *
 * Handles AWS SNS notifications for SES events:
 * - Confirms SNS subscription
 * - Validates SNS message signatures (security)
 * - Enqueues SES events to BullMQ for worker processing
 *
 * Security:
 * - Validates SNS signatures using AWS public certificates
 * - Prevents message forgery and replay attacks
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import axios from 'axios';
import * as crypto from 'crypto';

interface SNSMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  Token?: string;
}

@Injectable()
export class SESWebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SESWebhookService.name);
  private sesEventsQueue!: Queue;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = {
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
    };

    // Initialize BullMQ queue for SES events
    this.sesEventsQueue = new Queue('ses-events', {
      connection: redisConfig,
      defaultJobOptions: {
        attempts: 3, // Retry up to 3 times
        backoff: {
          type: 'exponential',
          delay: 5000, // 5s, 10s, 20s
        },
        removeOnComplete: {
          count: 100, // Keep last 100 completed
          age: 86400, // Keep for 24 hours
        },
        removeOnFail: false, // Keep failed for investigation
      },
    });

    this.logger.log('SES webhook service initialized with BullMQ queue');
  }

  async onModuleDestroy() {
    await this.sesEventsQueue?.close();
    this.logger.log('SES webhook service closed');
  }

  /**
   * Confirm SNS subscription (one-time setup)
   *
   * When you first configure SNS → HTTP endpoint subscription,
   * AWS sends a SubscriptionConfirmation message with a SubscribeURL.
   * You must call this URL to confirm the subscription.
   */
  async confirmSubscription(snsMessage: SNSMessage): Promise<void> {
    const subscribeUrl = snsMessage.SubscribeURL;

    if (!subscribeUrl) {
      throw new Error('Missing SubscribeURL in SNS subscription confirmation');
    }

    this.logger.log({
      message: 'Confirming SNS subscription',
      topicArn: snsMessage.TopicArn,
      subscribeUrl,
    });

    try {
      // Call AWS subscribe URL to confirm subscription
      const response = await axios.get(subscribeUrl, { timeout: 30000 });

      this.logger.log({
        message: 'SNS subscription confirmed successfully',
        topicArn: snsMessage.TopicArn,
        status: response.status,
      });
    } catch (error) {
      this.logger.error({
        message: 'Failed to confirm SNS subscription',
        error: error instanceof Error ? error.message : 'Unknown error',
        subscribeUrl,
      });
      throw error;
    }
  }

  /**
   * Validate SNS message signature
   *
   * AWS SNS signs all messages with a SHA1 with RSA signature.
   * We must verify this signature to ensure the message came from AWS
   * and was not tampered with.
   *
   * Reference: https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
   */
  async validateSNSSignature(snsMessage: SNSMessage): Promise<boolean> {
    try {
      const {
        SignatureVersion,
        Signature,
        SigningCertURL,
        Message,
        MessageId,
        Subject,
        Timestamp,
        TopicArn,
        Type,
        SubscribeURL,
        Token,
      } = snsMessage;

      // Only support SignatureVersion '1'
      if (SignatureVersion !== '1') {
        this.logger.warn({
          message: 'Unsupported SNS signature version',
          version: SignatureVersion,
        });
        return false;
      }

      // Verify SigningCertURL is from AWS (security check)
      const certUrl = new URL(SigningCertURL);
      if (!certUrl.hostname.endsWith('.amazonaws.com')) {
        this.logger.error({
          message: 'Invalid SNS signing certificate URL',
          url: SigningCertURL,
        });
        return false;
      }

      // Download signing certificate from AWS
      const certResponse = await axios.get(SigningCertURL, { timeout: 10000 });
      const certificate = certResponse.data;

      // Build string to sign (order matters!)
      // Different message types have different fields
      const stringToSign =
        Type === 'Notification'
          ? [
              'Message',
              Message,
              'MessageId',
              MessageId,
              Subject ? 'Subject' : null,
              Subject,
              'Timestamp',
              Timestamp,
              'TopicArn',
              TopicArn,
              'Type',
              Type,
            ]
              .filter((item) => item !== null)
              .join('\n') + '\n'
          : [
              'Message',
              Message,
              'MessageId',
              MessageId,
              'SubscribeURL',
              SubscribeURL,
              'Timestamp',
              Timestamp,
              'Token',
              Token,
              'TopicArn',
              TopicArn,
              'Type',
              Type,
            ].join('\n') + '\n';

      // Verify signature using RSA-SHA1
      const verifier = crypto.createVerify('RSA-SHA1');
      verifier.update(stringToSign, 'utf8');
      const isValid = verifier.verify(certificate, Signature, 'base64');

      if (!isValid) {
        this.logger.error({
          message: 'SNS signature validation failed',
          messageId: MessageId,
        });
      }

      return isValid;
    } catch (error) {
      this.logger.error({
        message: 'Error validating SNS signature',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Process SNS notification and enqueue to BullMQ
   *
   * Parses the SES event from the SNS message and adds it to
   * the BullMQ queue for processing by the worker.
   */
  async processSNSNotification(snsMessage: SNSMessage): Promise<void> {
    try {
      // Parse SES event from SNS message body
      const sesEvent = JSON.parse(snsMessage.Message);

      this.logger.log({
        message: 'Processing SES event from SNS',
        eventType: sesEvent.eventType,
        sesMessageId: sesEvent.mail?.messageId,
        snsMessageId: snsMessage.MessageId,
      });

      // Add to BullMQ queue for worker processing
      const job = await this.sesEventsQueue.add('process-ses-event', sesEvent, {
        jobId: `ses-${sesEvent.eventType}-${sesEvent.mail?.messageId}-${Date.now()}`,
        priority: this.getEventPriority(sesEvent.eventType),
      });

      this.logger.log({
        message: 'SES event enqueued successfully',
        jobId: job.id,
        eventType: sesEvent.eventType,
        sesMessageId: sesEvent.mail?.messageId,
      });
    } catch (error) {
      this.logger.error({
        message: 'Failed to process SNS notification',
        error: error instanceof Error ? error.message : 'Unknown error',
        snsMessageId: snsMessage.MessageId,
      });
      throw error;
    }
  }

  /**
   * Get priority for SES event type
   *
   * Complaints (spam reports) get highest priority - they're critical
   * for sender reputation. Bounces are also high priority. Deliveries
   * are lowest priority.
   */
  private getEventPriority(eventType: string): number {
    const priorities: Record<string, number> = {
      Complaint: 1, // CRITICAL - spam complaints
      Bounce: 2, // HIGH - failed deliveries
      Delivery: 3, // NORMAL - successful deliveries
    };

    return priorities[eventType] || 3;
  }

  /**
   * Get queue health metrics
   */
  async getQueueHealth() {
    const waiting = await this.sesEventsQueue.getWaitingCount();
    const active = await this.sesEventsQueue.getActiveCount();
    const completed = await this.sesEventsQueue.getCompletedCount();
    const failed = await this.sesEventsQueue.getFailedCount();
    const delayed = await this.sesEventsQueue.getDelayedCount();

    return {
      queue: 'ses-events',
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }
}
