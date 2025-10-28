/**
 * TASK-023: Webhook System Types
 *
 * TypeScript interfaces and types for webhook system
 */

import { WebhookEventType } from '../dto/webhook.dto';

/**
 * Webhook payload structure sent to client endpoints
 */
export interface WebhookPayload {
  type: WebhookEventType | string;
  timestamp: string; // ISO 8601 format
  data: EmailEventData;
}

/**
 * Email event data included in webhook payload
 */
export interface EmailEventData {
  outboxId: string;
  externalId?: string;
  to: string;
  subject: string;
  status: string;
  sesMessageId?: string;
  sentAt?: string;
  failedAt?: string;
  errorCode?: string;
  errorReason?: string;
  attempts?: number;
  recipient?: {
    externalId?: string;
    email: string;
  };
}

/**
 * Job data for webhook queue
 */
export interface WebhookJobData {
  webhookId: string;
  eventType: string;
  payload: WebhookPayload;
  attempt?: number;
}

/**
 * Webhook delivery result
 */
export interface WebhookDeliveryResult {
  success: boolean;
  responseCode?: number;
  responseBody?: string;
  error?: string;
  isRetryable?: boolean;
}

/**
 * HMAC signature verification result
 */
export interface SignatureVerificationResult {
  valid: boolean;
  error?: string;
}
