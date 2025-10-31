import { Injectable, Logger } from '@nestjs/common';
import {
  DSNReport,
  PerRecipientDSN,
  BouncedEmail,
  DSNParseError,
  BOUNCE_STATUS_CODES,
  BounceClassification,
  RecipientBounceClassification,
} from '../types/dsn-report.types';

/**
 * DSN Parser Service (RFC 3464)
 * Parses Delivery Status Notification messages to extract bounce information
 *
 * DSN Structure (RFC 3464):
 * - multipart/report message
 * - First part: human-readable explanation
 * - Second part: machine-readable delivery status
 * - Additional parts: optional (original message, etc.)
 */
@Injectable()
export class DSNParserService {
  private readonly logger = new Logger(DSNParserService.name);

  /**
   * Parse raw DSN message (multipart/report format)
   * @param rawDSN Raw DSN message from email
   * @returns Parsed DSN report
   */
  parseDSN(rawDSN: string): DSNReport {
    try {
      this.logger.debug(`Parsing DSN message (${rawDSN.length} chars)`);

      // DSN messages are multipart/report
      // Extract the delivery-status part (machine-readable)
      const deliveryStatusPart = this.extractDeliveryStatusPart(rawDSN);

      if (!deliveryStatusPart) {
        throw new Error('No delivery-status part found in DSN');
      }

      // Parse the delivery status content
      const report = this.parseDeliveryStatus(deliveryStatusPart);

      // Validate required fields
      if (!report.mimeVersion || !report.contentType || report.perRecipientFields.length === 0) {
        throw new Error('DSN missing required fields');
      }

      this.logger.debug(`Successfully parsed DSN with ${report.perRecipientFields.length} recipient(s)`);
      return report;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`DSN parsing failed: ${errorMessage}`);
      throw new DSNParseError('DSN_PARSING_FAILED', `Failed to parse DSN: ${errorMessage}`);
    }
  }

  /**
   * Extract the delivery-status part from multipart DSN
   * RFC 3464 Section 2.2
   */
  private extractDeliveryStatusPart(rawDSN: string): string | null {
    // DSN is multipart/report with Content-Type: message/delivery-status
    const boundaryMatch = rawDSN.match(/boundary="([^"]+)"/);
    if (!boundaryMatch) {
      // Try without quotes
      const altMatch = rawDSN.match(/boundary=([^\s;]+)/);
      if (!altMatch) {
        // Not multipart, treat as single part delivery status
        return rawDSN;
      }
    }

    const boundary = boundaryMatch ? boundaryMatch[1] : boundaryMatch?.[1];
    if (!boundary) return null;

    // Split by boundary
    const parts = rawDSN.split(`--${boundary}`);
    let deliveryStatusPart = null;

    for (const part of parts) {
      if (part.includes('Content-Type: message/delivery-status')) {
        // Extract content after headers
        const contentStart = part.indexOf('\n\n');
        if (contentStart !== -1) {
          deliveryStatusPart = part.substring(contentStart + 2).trim();
        }
        break;
      }
    }

    return deliveryStatusPart;
  }

  /**
   * Parse the delivery-status content
   * RFC 3464 Section 2.3
   */
  private parseDeliveryStatus(content: string): DSNReport {
    const lines = content.split('\n').map(line => line.trim());
    const report: Partial<DSNReport> = {
      perRecipientFields: [],
    };

    let currentSection: 'per-message' | 'per-recipient' | null = null;
    let perMessageFields: Record<string, string> = {};
    let perRecipientFields: Record<string, string> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Empty line indicates end of current section
      if (!line) {
        if (currentSection === 'per-message' && Object.keys(perMessageFields).length > 0) {
          Object.assign(report, this.parsePerMessageFields(perMessageFields));
          perMessageFields = {};
        } else if (currentSection === 'per-recipient' && Object.keys(perRecipientFields).length > 0) {
          const parsed = this.parsePerRecipientFields(perRecipientFields);
          report.perRecipientFields!.push(parsed);
          perRecipientFields = {};
        }
        currentSection = null;
        continue;
      }

      // Skip comments
      if (line.startsWith('#')) continue;

      // Parse field lines (Key: value)
      if (line.includes(':')) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        const fieldKey = key.trim().toLowerCase();

        // Section detection based on field names (RFC 3464)
        if (this.isPerMessageField(fieldKey)) {
          if (currentSection !== 'per-message') {
            // Save previous per-recipient section if exists
            if (currentSection === 'per-recipient' && Object.keys(perRecipientFields).length > 0) {
              const parsed = this.parsePerRecipientFields(perRecipientFields);
              report.perRecipientFields!.push(parsed);
              perRecipientFields = {};
            }
            currentSection = 'per-message';
          }
          perMessageFields[fieldKey] = value;
        } else if (this.isPerRecipientField(fieldKey)) {
          if (currentSection !== 'per-recipient') {
            // Save previous per-message section if exists
            if (currentSection === 'per-message' && Object.keys(perMessageFields).length > 0) {
              Object.assign(report, this.parsePerMessageFields(perMessageFields));
              perMessageFields = {};
            }
            currentSection = 'per-recipient';
          }
          perRecipientFields[fieldKey] = value;
        }
      }
    }

    // Handle any remaining fields
    if (Object.keys(perMessageFields).length > 0) {
      Object.assign(report, this.parsePerMessageFields(perMessageFields));
    }
    if (Object.keys(perRecipientFields).length > 0) {
      const parsed = this.parsePerRecipientFields(perRecipientFields);
      report.perRecipientFields!.push(parsed);
    }

    return report as DSNReport;
  }

  /**
   * Check if field is per-message (RFC 3464 Section 2.3.1)
   */
  private isPerMessageField(fieldKey: string): boolean {
    const perMessageFields = [
      'reporting-mta',
      'x-original-message-id',
      'received-from-mta',
      'arrival-date',
      'mime-version',
      'content-type',
      'message-id',
      'timestamp',
    ];
    return perMessageFields.includes(fieldKey);
  }

  /**
   * Check if field is per-recipient (RFC 3464 Section 2.3.2)
   */
  private isPerRecipientField(fieldKey: string): boolean {
    const perRecipientFields = [
      'original-recipient',
      'final-recipient',
      'action',
      'status',
      'remote-mta',
      'diagnostic-code',
      'last-attempt-date',
      'will-retry-until',
      'extension-field', // Any field not in per-message
    ];
    return perRecipientFields.includes(fieldKey) || fieldKey.startsWith('x-');
  }

  /**
   * Parse per-message fields
   */
  private parsePerMessageFields(fields: Record<string, string>): Partial<DSNReport> {
    const report: Partial<DSNReport> = {};

    // Required fields
    report.mimeVersion = fields['mime-version'] || '1.0';
    report.contentType = fields['content-type'] || 'message/delivery-status';
    report.timestamp = fields.timestamp ? new Date(fields.timestamp) : new Date();

    // Optional fields
    if (fields['reporting-mta']) {
      report.reportingMTA = this.parseMTAField(fields['reporting-mta']);
    }

    if (fields['x-original-message-id']) {
      report.xOriginalMessageID = fields['x-original-message-id'];
    }

    if (fields['received-from-mta']) {
      const mtaInfo = this.parseMTAField(fields['received-from-mta']);
      report.receivedFromMTA = {
        nametype: mtaInfo.nametype,
        name: mtaInfo.name,
      };
    }

    if (fields['arrival-date']) {
      // Store in xOriginalMessageID as a workaround
      report.xOriginalMessageID = fields['arrival-date'];
    }

    if (fields['message-id']) {
      report.xOriginalMessageID = fields['message-id'];
    }

    return report;
  }

  /**
   * Parse per-recipient fields
   */
  private parsePerRecipientFields(fields: Record<string, string>): PerRecipientDSN {
    const recipient: Partial<PerRecipientDSN> = {};

    // Required fields - extract email from RFC 822 format if present
    recipient.originalRecipient = this.extractEmailFromRecipient(fields['original-recipient'] || '');
    recipient.finalRecipient = this.extractEmailFromRecipient(fields['final-recipient'] || recipient.originalRecipient);
    recipient.action = (fields.action as PerRecipientDSN['action']) || 'failed';
    recipient.status = fields.status || '5.0.0';

    // Optional fields
    if (fields['remote-mta']) {
      recipient.remoteMTA = fields['remote-mta'];
    }

    if (fields['diagnostic-code']) {
      recipient.diagnosticCode = fields['diagnostic-code'];
    }

    if (fields['last-attempt-date']) {
      recipient.lastAttemptDate = new Date(fields['last-attempt-date']);
    }

    // Extension fields stored in diagnostic code for now
    if (fields['will-retry-until']) {
      recipient.diagnosticCode = (recipient.diagnosticCode || '') + ` [will-retry-until: ${fields['will-retry-until']}]`;
    }

    // Store extension fields in diagnostic code
    for (const [key, value] of Object.entries(fields)) {
      if (key.startsWith('x-') && !['x-original-message-id'].includes(key)) {
        recipient.diagnosticCode = (recipient.diagnosticCode || '') + ` [${key}: ${value}]`;
      }
    }

    return recipient as PerRecipientDSN;
  }

  /**
   * Parse MTA field (RFC 2157)
   * Format: type;name or name
   */
  private parseMTAField(mtaField: string): import('../types/dsn-report.types').MTAField {
    if (mtaField.includes(';')) {
      const [type, name] = mtaField.split(';');
      return {
        nametype: type.toLowerCase() as 'dns' | 'x400' | 'unknown',
        name: name.trim(),
      };
    }

    // Default to DNS if no type specified
    return {
      nametype: 'dns',
      name: mtaField.trim(),
    };
  }

  /**
   * Extract email address from RFC 822 recipient format
   * Format: rfc822;email@domain.com or email@domain.com
   */
  private extractEmailFromRecipient(recipientField: string): string {
    if (!recipientField) return '';

    // Remove RFC 822 type prefix if present
    if (recipientField.toLowerCase().startsWith('rfc822;')) {
      return recipientField.substring(7).trim();
    }

    // Check for other common formats
    if (recipientField.toLowerCase().startsWith('x400;')) {
      // X.400 format - not supported, return as-is
      return recipientField;
    }

    // Assume it's already an email address
    return recipientField.trim();
  }

  /**
   * Classify bounce type based on DSN report
   */
  classifyBounce(dsn: DSNReport): BounceClassification {
    if (dsn.perRecipientFields.length === 0) {
      return {
        type: 'undetermined',
        reason: 'No recipient information',
        shouldSuppress: false,
      };
    }

    // Check all recipients for the most severe bounce type
    let mostSevereType: 'hard' | 'soft' | 'transient' | 'undetermined' = 'undetermined';
    let mostSevereReason = 'Unknown';
    let shouldSuppress = false;

    for (const recipient of dsn.perRecipientFields) {
      const classification = this.classifyRecipientBounce(recipient);

      // Update most severe
      if (classification.severity > this.getBounceSeverity(mostSevereType)) {
        mostSevereType = classification.type;
        mostSevereReason = classification.reason;
        shouldSuppress = classification.shouldSuppress;
      }
    }

    return {
      type: mostSevereType,
      reason: mostSevereReason,
      shouldSuppress,
    };
  }

  /**
   * Classify bounce for a single recipient
   */
  private classifyRecipientBounce(recipient: PerRecipientDSN): RecipientBounceClassification {
    const statusCode = recipient.status;
    const diagnosticCode = recipient.diagnosticCode || '';

    // Hard bounce (5.x.x)
    if (statusCode.startsWith('5.')) {
      return {
        type: 'hard',
        reason: this.getHardBounceReason(statusCode, diagnosticCode),
        severity: 3,
        shouldSuppress: true,
      };
    }

    // Soft bounce (4.x.x)
    if (statusCode.startsWith('4.')) {
      return {
        type: 'soft',
        reason: this.getSoftBounceReason(statusCode, diagnosticCode),
        severity: 2,
        shouldSuppress: false, // Soft bounces don't suppress immediately
      };
    }

    // Success (2.x.x)
    if (statusCode.startsWith('2.')) {
      return {
        type: 'transient',
        reason: 'Delivery successful',
        severity: 0,
        shouldSuppress: false,
      };
    }

    // Other status codes
    return {
      type: 'undetermined',
      reason: `Unknown status: ${statusCode}`,
      severity: 1,
      shouldSuppress: false,
    };
  }

  /**
   * Get severity level for bounce type
   */
  private getBounceSeverity(type: 'hard' | 'soft' | 'transient' | 'undetermined'): number {
    switch (type) {
      case 'hard': return 3;
      case 'soft': return 2;
      case 'transient': return 1;
      default: return 0;
    }
  }

  /**
   * Get hard bounce reason from status code
   */
  private getHardBounceReason(statusCode: string, diagnosticCode: string): string {
    const statuses = BOUNCE_STATUS_CODES.HARD_BOUNCE as readonly string[];

    // Check if status code is in the list
    if (statuses && Array.isArray(statuses)) {
      if ((statuses as any).some((s: any) => statusCode.startsWith(s))) {
        return 'hard_bounce';
      }
    }

    // Try to extract from diagnostic code
    if (diagnosticCode) {
      if (diagnosticCode.toLowerCase().includes('user')) return 'invalid_recipient';
      if (diagnosticCode.toLowerCase().includes('domain')) return 'invalid_domain';
      if (diagnosticCode.toLowerCase().includes('mailbox')) return 'invalid_mailbox';
    }

    return 'unknown_hard_bounce';
  }

  /**
   * Get soft bounce reason from status code
   */
  private getSoftBounceReason(statusCode: string, diagnosticCode: string): string {
    const statuses = BOUNCE_STATUS_CODES.SOFT_BOUNCE as readonly string[];

    if (statuses && Array.isArray(statuses)) {
      if ((statuses as any).some((s: any) => statusCode.startsWith(s))) {
        return 'soft_bounce';
      }
    }

    if (diagnosticCode) {
      if (diagnosticCode.toLowerCase().includes('timeout')) return 'connection_timeout';
      if (diagnosticCode.toLowerCase().includes('full')) return 'mailbox_full_temporary';
      if (diagnosticCode.toLowerCase().includes('service')) return 'service_unavailable';
    }

    return 'unknown_soft_bounce';
  }
}
