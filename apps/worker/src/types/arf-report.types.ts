/**
 * RFC 5965 - Abuse Reporting Format (ARF) Types
 * Represents the structure of abuse reports (spam complaints)
 */

export interface ARFReport {
  // Machine-readable feedback header
  version: string; // RFC version (usually "1.0")
  userAgent?: string; // User agent that generated the report
  feedbackType: ARFFeedbackType;
  timestamp: Date;

  // Original email headers for analysis
  originalHeaders: {
    messageID?: string;
    date?: Date;
    from?: string;
    to?: string;
    subject?: string;
    [key: string]: any;
  };

  // Original message body (usually truncated)
  originalMessage?: string;

  // MIME structure
  mimeVersion: string;
  contentType: string;

  // ARF-specific fields
  sourceIP?: string;
  reportingMUA?: string;
  authFailure?: string; // e.g., "dkim", "spf", "dmarc"
  authFailureType?: string; // e.g., "dkim", "spf", "dmarc" (from Auth-Failure header)
}

export type ARFFeedbackType =
  | 'abuse' // Bulk spam
  | 'fraud' // Fraud/phishing
  | 'auth-failure' // Authentication failure
  | 'not-spam' // Not spam (whitelisting)
  | 'complaint' // Generic complaint
  | 'opt-out' // Unsubscribe request
  | 'other'; // Unknown

export interface ComplaintInfo {
  email: string;
  feedbackType: ARFFeedbackType;
  timestamp: Date;
  sourceIP?: string;
  userAgent?: string;
  complaint: string;
}

export interface AuthFailureReport {
  authMethod: 'dkim' | 'spf' | 'dmarc';
  domain: string;
  failure: string;
  timestamp: Date;
}

export const ARF_FEEDBACK_TYPE_MAP: Record<string, ARFFeedbackType> = {
  'abuse': 'abuse',
  'fraud': 'fraud',
  'auth-failure': 'auth-failure',
  'not-spam': 'not-spam',
  'complaint': 'complaint',
  'opt-out': 'opt-out',
  'other': 'other',
};

export class ARFParseError extends Error {
  constructor(
    public code: string,
    message: string,
    public originalText?: string,
  ) {
    super(message);
    this.name = 'ARFParseError';
  }
}

/**
 * Common ARF Headers (from RFC 5965)
 */
export const ARF_HEADERS = {
  // Mandatory
  FEEDBACK_TYPE: 'Feedback-Type',
  USER_AGENT: 'User-Agent',
  VERSION: 'Version',

  // Conditional
  SOURCE_IP: 'Source-IP',
  AUTHENTICATION_RESULTS: 'Authentication-Results',
  ORIGINAL_MAIL_FROM: 'Original-Mail-From',
  ORIGINAL_RCPT_TO: 'Original-Rcpt-To',
  REPORTING_MUA: 'Reporting-MUA',
  ARRIVAL_DATE: 'Arrival-Date',

  // Optional
  AUTH_FAILURE: 'Auth-Failure',
  DLP_POLICY_NAME: 'DLP-Policy-Name',
  INCIDENTS: 'Incidents',
  PREFERENCE: 'Preference',
  REPORT_ID: 'Report-ID',
  SIGNATURE: 'Signature',
} as const;
