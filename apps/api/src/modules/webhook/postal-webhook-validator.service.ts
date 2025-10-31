import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface PostalWebhookPayload {
  event: PostalEventType;
  timestamp: number;
  payload: Record<string, any>;
}

export type PostalEventType =
  | 'MessageDelivered'
  | 'MessageBounced'
  | 'MessageComplaint'
  | 'MessageOpened'
  | 'MessageClicked'
  | 'MessageSpamComplaint'
  | 'MessageLinkClicked'
  | 'MessageHeld'
  | 'MessageDeleted'
  | 'MessageSuppressed';

/**
 * Postal Webhook Validator Service
 * Validates and parses Postal webhook messages with HMAC signature verification
 */
@Injectable()
export class PostalWebhookValidatorService {
  private readonly logger = new Logger(PostalWebhookValidatorService.name);

  /**
   * Validate webhook signature using HMAC-SHA256
   * @param payload Raw webhook payload body
   * @param signature Signature from X-Postal-Signature header
   * @param secret Webhook secret key
   * @returns true if signature is valid
   */
  validateSignature(payload: string, signature: string, secret: string): boolean {
    try {
      // Postal uses HMAC-SHA256 of the raw body
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      // Constant-time comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch (error) {
      this.logger.warn(`Signature validation failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Parse and validate Postal webhook payload
   */
  parseWebhook(payload: any): PostalWebhookPayload {
    // Postal format validation
    if (!payload.event || !payload.timestamp || !payload.payload) {
      throw new Error('Invalid Postal webhook format');
    }

    // Validate event type
    if (!this.isValidEventType(payload.event)) {
      throw new Error(`Unknown event type: ${payload.event}`);
    }

    return {
      event: payload.event as PostalEventType,
      timestamp: payload.timestamp,
      payload: payload.payload,
    };
  }

  /**
   * Extract message ID from webhook payload
   */
  extractMessageId(payload: Record<string, any>): string | null {
    // Different events store message ID in different places
    if (payload.message?.id) {
      return payload.message.id;
    }
    if (payload.message_id) {
      return payload.message_id;
    }
    if (payload.id) {
      return payload.id;
    }
    return null;
  }

  /**
   * Extract recipient email from webhook payload
   */
  extractRecipientEmail(payload: Record<string, any>): string | null {
    if (payload.recipient) {
      return payload.recipient;
    }
    if (payload.message?.recipient) {
      return payload.message.recipient;
    }
    if (payload.to) {
      return payload.to;
    }
    return null;
  }

  /**
   * Parse delivery event
   */
  parseDeliveryEvent(payload: Record<string, any>): {
    messageId: string | null;
    recipient: string | null;
    timestamp: Date;
    remoteMTA?: string;
  } {
    return {
      messageId: this.extractMessageId(payload),
      recipient: this.extractRecipientEmail(payload),
      timestamp: new Date(payload.timestamp || payload.delivered_at || Date.now()),
      remoteMTA: payload.mta || payload.remote_mta,
    };
  }

  /**
   * Parse bounce event
   */
  parseBounceEvent(payload: Record<string, any>): {
    messageId: string | null;
    recipient: string | null;
    bounceType: 'hard' | 'soft' | 'transient';
    reason?: string;
    diagnosticCode?: string;
    timestamp: Date;
  } {
    const bounceType = this.classifyPostalBounce(payload.bounce_type || payload.type);

    return {
      messageId: this.extractMessageId(payload),
      recipient: this.extractRecipientEmail(payload),
      bounceType,
      reason: payload.bounce_code || payload.reason,
      diagnosticCode: payload.diagnostic_code || payload.code,
      timestamp: new Date(payload.timestamp || payload.bounced_at || Date.now()),
    };
  }

  /**
   * Parse complaint event
   */
  parseComplaintEvent(payload: Record<string, any>): {
    messageId: string | null;
    recipient: string | null;
    complaintType: string;
    timestamp: Date;
  } {
    return {
      messageId: this.extractMessageId(payload),
      recipient: this.extractRecipientEmail(payload),
      complaintType: payload.complaint_type || payload.feedback_type || 'spam',
      timestamp: new Date(payload.timestamp || payload.complained_at || Date.now()),
    };
  }

  /**
   * Parse open event
   */
  parseOpenEvent(payload: Record<string, any>): {
    messageId: string | null;
    recipient: string | null;
    timestamp: Date;
    userAgent?: string;
    ipAddress?: string;
  } {
    return {
      messageId: this.extractMessageId(payload),
      recipient: this.extractRecipientEmail(payload),
      timestamp: new Date(payload.timestamp || payload.opened_at || Date.now()),
      userAgent: payload.user_agent,
      ipAddress: payload.ip_address || payload.ip,
    };
  }

  /**
   * Parse click event
   */
  parseClickEvent(payload: Record<string, any>): {
    messageId: string | null;
    recipient: string | null;
    url?: string;
    timestamp: Date;
    userAgent?: string;
    ipAddress?: string;
  } {
    return {
      messageId: this.extractMessageId(payload),
      recipient: this.extractRecipientEmail(payload),
      url: payload.url || payload.link,
      timestamp: new Date(payload.timestamp || payload.clicked_at || Date.now()),
      userAgent: payload.user_agent,
      ipAddress: payload.ip_address || payload.ip,
    };
  }

  /**
   * Classify Postal bounce type to standard bounce type
   */
  private classifyPostalBounce(bounceType?: string): 'hard' | 'soft' | 'transient' {
    if (!bounceType) {
      return 'transient';
    }

    const normalized = bounceType.toLowerCase();

    // Hard bounce indicators
    if (
      normalized.includes('hard') ||
      normalized.includes('permanent') ||
      normalized.includes('invalid') ||
      normalized.includes('disabled') ||
      normalized.includes('not-found') ||
      normalized.includes('reject')
    ) {
      return 'hard';
    }

    // Soft bounce indicators
    if (
      normalized.includes('soft') ||
      normalized.includes('full') ||
      normalized.includes('throttle') ||
      normalized.includes('rate') ||
      normalized.includes('suspended')
    ) {
      return 'soft';
    }

    // Default to transient
    return 'transient';
  }

  /**
   * Validate webhook timestamp (prevent replay attacks)
   */
  validateTimestamp(webhookTimestamp: number, maxAgeSeconds: number = 300): boolean {
    const now = Date.now() / 1000; // Convert to seconds
    const age = now - webhookTimestamp;

    if (age < 0 || age > maxAgeSeconds) {
      this.logger.warn(
        `Webhook timestamp validation failed. Age: ${age}s, Max: ${maxAgeSeconds}s`,
      );
      return false;
    }

    return true;
  }

  /**
   * Check if event type is valid
   */
  private isValidEventType(eventType: string): boolean {
    const validTypes: PostalEventType[] = [
      'MessageDelivered',
      'MessageBounced',
      'MessageComplaint',
      'MessageOpened',
      'MessageClicked',
      'MessageSpamComplaint',
      'MessageLinkClicked',
      'MessageHeld',
      'MessageDeleted',
      'MessageSuppressed',
    ];

    return validTypes.includes(eventType as PostalEventType);
  }

  /**
   * Get event category
   */
  getEventCategory(
    eventType: PostalEventType,
  ): 'delivery' | 'bounce' | 'complaint' | 'engagement' | 'other' {
    switch (eventType) {
      case 'MessageDelivered':
        return 'delivery';
      case 'MessageBounced':
      case 'MessageHeld':
        return 'bounce';
      case 'MessageComplaint':
      case 'MessageSpamComplaint':
        return 'complaint';
      case 'MessageOpened':
      case 'MessageClicked':
      case 'MessageLinkClicked':
        return 'engagement';
      default:
        return 'other';
    }
  }
}
