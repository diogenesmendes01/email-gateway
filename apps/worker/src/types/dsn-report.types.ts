/**
 * RFC 3464 - Delivery Status Notification (DSN) Types
 * Represents the structure of a DSN message used for bounce/delivery tracking
 */

export interface DSNReport {
  // Message header fields
  reportingMTA?: string;
  xOriginalMessageID?: string;
  receivedFromMTA?: {
    nametype: 'dns' | 'x400' | 'unknown';
    name: string;
  };
  arrivalDate?: Date;

  // Per-message fields (mandatory)
  mimeVersion: string;
  contentType: string;
  messageID?: string;
  timestamp: Date;

  // Per-recipient status (array of all bounced recipients)
  perRecipientFields: PerRecipientDSN[];
}

export interface PerRecipientDSN {
  // Original recipient
  originalRecipient: string;
  finalRecipient: string;
  action: 'failed' | 'delayed' | 'delivered' | 'relayed' | 'expanded';
  status: string; // RFC 3464 status code (e.g., "4.4.2" for soft bounce)

  // Diagnostic info
  remoteMTA?: string;
  diagnosticCode?: string; // Extended status code or SMTP code
  lastAttemptDate?: Date;
  willRetryUntil?: Date;

  // Additional fields
  extensionFields?: Record<string, string>;
}

export interface BouncedEmail {
  email: string;
  action: 'failed' | 'delayed' | 'delivered' | 'relayed' | 'expanded';
  status: string;
  diagnosticCode?: string;
}

export interface ClassifiedBounce {
  email: string;
  type: 'hard' | 'soft' | 'transient' | 'undetermined';
  reason: string;
  shouldSuppress: boolean;
  diagnosticCode?: string;
  statusCode?: string;
  expiresAt?: Date;
}

/**
 * SMTP Enhanced Status Codes (RFC 3463)
 * Format: X.Y.Z where:
 * - X: Class (2=success, 4=persistent transient, 5=permanent failure)
 * - Y: Subject (0=other, 1=addressing, 2=mailbox, 3=mail system, 4=network)
 * - Z: Detail (0-9 depending on subject)
 */
export const BOUNCE_STATUS_CODES = {
  // Permanent failures (5.x.x)
  'hard': {
    'invalid_recipient': ['5.1.1'], // Invalid email address
    'invalid_domain': ['5.1.2'], // Domain does not accept mail
    'invalid_mailbox': ['5.2.1'], // Mailbox unavailable
    'account_disabled': ['5.2.1', '5.7.1'], // Account disabled or not allowed
    'mailbox_full': ['5.2.2'], // Mailbox full
    'smtp_protocol_error': ['5.5.1'], // Syntax error in address
  },
  // Transient failures (4.x.x)
  'soft': {
    'mailbox_full_temporary': ['4.2.2'], // Mailbox full (temporary)
    'connection_timeout': ['4.4.2', '4.4.7'], // Connection timeout
    'service_unavailable': ['4.3.2', '4.4.3'], // Service unavailable
    'mailbox_busy': ['4.2.1'], // Mailbox busy
    'too_many_connections': ['4.5.3'], // Too many connections from this host
    'rate_limited': ['4.7.0'], // Rate limit exceeded
  },
};

export interface DSNParseError {
  code: string;
  message: string;
  originalText?: string;
}
