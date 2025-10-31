/**
 * DSN (Delivery Status Notification) Types and Interfaces
 * RFC 3464 - SMTP Delivery Status Notifications
 */

/**
 * MTA (Mail Transfer Agent) field structure
 */
export interface MTAField {
  /** Type of MTA name (dns, x400, or unknown) */
  nametype: 'dns' | 'x400' | 'unknown';
  /** MTA name */
  name: string;
}

/**
 * Per-recipient DSN information
 */
export interface PerRecipientDSN {
  /** Original recipient address */
  originalRecipient: string;
  /** Final recipient address after forwarding */
  finalRecipient: string;
  /** Delivery action taken */
  action: 'failed' | 'delayed' | 'delivered' | 'relayed' | 'expanded';
  /** Status code (RFC 3463) */
  status: string;
  /** Remote MTA that reported the status */
  remoteMTA?: string;
  /** Diagnostic code from the remote MTA */
  diagnosticCode?: string;
  /** Date of last delivery attempt */
  lastAttemptDate?: Date;
}

/**
 * Complete DSN report structure
 */
export interface DSNReport {
  /** MIME version (usually 1.0) */
  mimeVersion: string;
  /** Content type (usually message/delivery-status) */
  contentType: string;
  /** Reporting MTA information */
  reportingMTA?: MTAField;
  /** Received from MTA information */
  receivedFromMTA?: MTAField;
  /** Per-recipient delivery status information */
  perRecipientFields: PerRecipientDSN[];
  /** Timestamp of the DSN */
  timestamp: Date;
  /** Original message ID */
  xOriginalMessageID?: string;
}

/**
 * Bounce email information extracted from DSN
 */
export interface BouncedEmail {
  /** Email address that bounced */
  email: string;
  /** Bounce type (hard or soft) */
  bounceType: 'hard' | 'soft';
  /** Bounce reason/subject */
  reason: string;
  /** SMTP status code */
  statusCode: string;
  /** Diagnostic message */
  diagnosticCode?: string;
  /** Timestamp of bounce */
  timestamp: Date;
}

/**
 * Bounce classification result
 */
export interface BounceClassification {
  /** Bounce type */
  type: 'hard' | 'soft' | 'transient' | 'undetermined';
  /** Bounce reason */
  reason: string;
  /** Whether the email should be suppressed */
  shouldSuppress: boolean;
}

/**
 * Recipient bounce classification result
 */
export interface RecipientBounceClassification {
  /** Bounce type */
  type: 'hard' | 'soft' | 'transient' | 'undetermined';
  /** Bounce reason */
  reason: string;
  /** Bounce severity (higher is more severe) */
  severity: number;
  /** Whether the email should be suppressed */
  shouldSuppress: boolean;
}

/**
 * Classified bounce with email and action
 */
export interface ClassifiedBounce {
  /** Email address that bounced */
  email: string;
  /** Bounce type */
  bounceType: 'hard' | 'soft' | 'transient';
  /** Action to take */
  action: string;
  /** Priority level */
  priority: 'high' | 'medium' | 'low';
}

/**
 * DSN parsing error class
 */
export class DSNParseError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'DSNParseError';
  }
}

/**
 * Bounce status codes mapping
 */
export const BOUNCE_STATUS_CODES = {
  HARD_BOUNCE: ['5.1.1', '5.1.2', '5.1.3', '5.1.4', '5.1.6', '5.1.7', '5.1.8', '5.1.9', '5.1.10', '5.2.0', '5.2.1', '5.2.2', '5.2.3', '5.2.4', '5.3.0', '5.3.1', '5.3.2', '5.3.3', '5.3.4', '5.3.5', '5.4.0', '5.4.1', '5.4.2', '5.4.3', '5.4.4', '5.4.5', '5.4.6', '5.4.7', '5.4.8', '5.4.9', '5.5.0', '5.5.1', '5.5.2', '5.5.3', '5.5.4', '5.5.5', '5.5.6'],
  SOFT_BOUNCE: ['4.1.1', '4.1.2', '4.1.3', '4.1.4', '4.1.5', '4.1.6', '4.1.7', '4.1.8', '4.2.1', '4.2.2', '4.2.3', '4.2.4', '4.3.0', '4.3.1', '4.3.2', '4.3.3', '4.3.4', '4.3.5', '4.4.1', '4.4.2', '4.4.3', '4.4.4', '4.4.5', '4.4.6', '4.4.7', '4.5.0', '4.6.0', '4.6.1', '4.6.2', '4.6.3', '4.6.4', '4.6.5', '4.7.0', '4.7.1', '4.7.2', '4.7.3', '4.7.4', '4.7.5']
} as const;
