import { Injectable, Logger } from '@nestjs/common';
import {
  DSNReport,
  PerRecipientDSN,
  BouncedEmail,
  DSNParseError,
  BOUNCE_STATUS_CODES,
} from '../types/dsn-report.types';

/**
 * DSN Parser Service (RFC 3464)
 * Parses Delivery Status Notification messages to extract bounce information
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
      const lines = rawDSN.split('\n').map(line => line.trim());
      const report: Partial<DSNReport> = {
        perRecipientFields: [],
      };

      let currentSection = 'headers';
      let perMessageFields: Record<string, string> = {};
      let perRecipientFields: Record<string, string> = {};
      let recipientCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip empty lines but track section transitions
        if (!line) {
          if (currentSection === 'per-message' && Object.keys(perMessageFields).length > 0) {
            Object.assign(report, this.parsePerMessageFields(perMessageFields));
          }
          if (
            currentSection === 'per-recipient' &&
            Object.keys(perRecipientFields).length > 0
          ) {
            const parsed = this.parsePerRecipientFields(perRecipientFields);
            (report.perRecipientFields as PerRecipientDSN[]).push(parsed);
            perRecipientFields = {};
            recipientCount++;
          }
          continue;
        }

        // Parse field lines (Key: value)
        if (line.includes(':')) {
          const [key, ...valueParts] = line.split(':');
          const value = valueParts.join(':').trim();
          const fieldKey = key.trim().toLowerCase();

          // Determine section based on field names
          if (
            [
              'reporting-mta',
              'x-original-message-id',
              'received-from-mta',
              'arrival-date',
            ].includes(fieldKey)
          ) {
            currentSection = 'per-message';
            perMessageFields[fieldKey] = value;
          } else if (
            [
              'original-recipient',
              'final-recipient',
              'action',
              'status',
              'remote-mta',
              'diagnostic-code',
              'last-attempt-date',
              'will-retry-until',
            ].includes(fieldKey)
          ) {
            currentSection = 'per-recipient';
            perRecipientFields[fieldKey] = value;
          }
        }
      }

      // Handle last per-recipient block
      if (Object.keys(perRecipientFields).length > 0) {
        const parsed = this.parsePerRecipientFields(perRecipientFields);
        (report.perRecipientFields as PerRecipientDSN[]).push(parsed);
      }

      // Set default values
      if (!report.mimeVersion) report.mimeVersion = '1.0';
      if (!report.contentType) report.contentType = 'multipart/report';
      if (!report.timestamp) report.timestamp = new Date();

      return report as DSNReport;
    } catch (error) {
      this.logger.error(`Failed to parse DSN: ${error.message}`);
      throw {
        code: 'DSN_PARSE_ERROR',
        message: 'Failed to parse DSN message',
        originalText: rawDSN.substring(0, 200),
      } as DSNParseError;
    }
  }

  /**
   * Classify a bounce based on status code and diagnostic code
   */
  classifyBounce(dsn: DSNReport): {
    type: 'hard' | 'soft' | 'transient';
    reason: string;
    shouldSuppress: boolean;
  } {
    if (dsn.perRecipientFields.length === 0) {
      return {
        type: 'undetermined',
        reason: 'No recipient fields found',
        shouldSuppress: false,
      };
    }

    const recipient = dsn.perRecipientFields[0];
    const statusCode = recipient.status;
    const diagnosticCode = recipient.diagnosticCode || '';

    // Extract main status code (first digit)
    const mainStatus = statusCode.split('.')[0];

    // Hard bounce (5.x.x - permanent failure)
    if (mainStatus === '5') {
      return {
        type: 'hard',
        reason: this.getHardBounceReason(statusCode, diagnosticCode),
        shouldSuppress: true,
      };
    }

    // Soft bounce (4.x.x - transient failure)
    if (mainStatus === '4') {
      return {
        type: 'soft',
        reason: this.getSoftBounceReason(statusCode, diagnosticCode),
        shouldSuppress: false,
      };
    }

    // Default to transient
    return {
      type: 'transient',
      reason: 'Unknown bounce type',
      shouldSuppress: false,
    };
  }

  /**
   * Extract all bounced emails from DSN
   */
  extractBouncedEmails(dsn: DSNReport): BouncedEmail[] {
    return dsn.perRecipientFields.map(field => ({
      email: field.finalRecipient || field.originalRecipient,
      action: field.action,
      status: field.status,
      diagnosticCode: field.diagnosticCode,
    }));
  }

  /**
   * Parse per-message fields
   */
  private parsePerMessageFields(fields: Record<string, string>): Partial<DSNReport> {
    return {
      reportingMTA: fields['reporting-mta'],
      xOriginalMessageID: fields['x-original-message-id'],
      arrivalDate: fields['arrival-date'] ? new Date(fields['arrival-date']) : undefined,
      mimeVersion: fields['mime-version'] || '1.0',
      contentType: fields['content-type'] || 'multipart/report',
    };
  }

  /**
   * Parse per-recipient fields
   */
  private parsePerRecipientFields(fields: Record<string, string>): PerRecipientDSN {
    const action = fields['action']?.toLowerCase() as
      | 'failed'
      | 'delayed'
      | 'delivered'
      | 'relayed'
      | 'expanded'
      | undefined;

    return {
      originalRecipient: fields['original-recipient'] || '',
      finalRecipient: fields['final-recipient'] || '',
      action: action || 'failed',
      status: fields['status'] || '5.0.0',
      remoteMTA: fields['remote-mta'],
      diagnosticCode: fields['diagnostic-code'],
      lastAttemptDate: fields['last-attempt-date']
        ? new Date(fields['last-attempt-date'])
        : undefined,
      willRetryUntil: fields['will-retry-until']
        ? new Date(fields['will-retry-until'])
        : undefined,
    };
  }

  /**
   * Get hard bounce reason from status code
   */
  private getHardBounceReason(statusCode: string, diagnosticCode: string): string {
    const codes = BOUNCE_STATUS_CODES.hard;

    // Check each category
    for (const [reason, statuses] of Object.entries(codes)) {
      if (statuses.some(s => statusCode.startsWith(s.split('.')[0] + '.'))) {
        return reason;
      }
    }

    // Try to extract from diagnostic code
    if (diagnosticCode) {
      if (diagnosticCode.includes('user')) return 'invalid_recipient';
      if (diagnosticCode.includes('domain')) return 'invalid_domain';
      if (diagnosticCode.includes('mailbox')) return 'invalid_mailbox';
    }

    return 'unknown_hard_bounce';
  }

  /**
   * Get soft bounce reason from status code
   */
  private getSoftBounceReason(statusCode: string, diagnosticCode: string): string {
    const codes = BOUNCE_STATUS_CODES.soft;

    for (const [reason, statuses] of Object.entries(codes)) {
      if (statuses.some(s => statusCode.startsWith(s.split('.')[0] + '.'))) {
        return reason;
      }
    }

    if (diagnosticCode) {
      if (diagnosticCode.includes('timeout')) return 'connection_timeout';
      if (diagnosticCode.includes('full')) return 'mailbox_full_temporary';
      if (diagnosticCode.includes('service')) return 'service_unavailable';
    }

    return 'unknown_soft_bounce';
  }
}
