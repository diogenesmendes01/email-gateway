import { Injectable, Logger } from '@nestjs/common';
import {
  ARFReport,
  ComplaintInfo,
  ARFFeedbackType,
  ARF_FEEDBACK_TYPE_MAP,
  ARF_HEADERS,
  ARFParseError,
  AuthFailureReport,
} from '../types/arf-report.types';

/**
 * ARF Parser Service (RFC 5965)
 * Parses Abuse Reporting Format messages to extract complaint/abuse information
 */
@Injectable()
export class ARFParserService {
  private readonly logger = new Logger(ARFParserService.name);

  /**
   * Parse raw ARF message (multipart/report format)
   * @param rawARF Raw ARF message from email
   * @returns Parsed ARF report
   */
  parseARF(rawARF: string): ARFReport {
    try {
      const lines = rawARF.split('\n');
      const headers: Record<string, string> = {};
      let bodyStartIdx = 0;
      let originalMessage = '';

      // Parse headers until empty line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Empty line marks end of headers
        if (!line.trim()) {
          bodyStartIdx = i + 1;
          break;
        }

        // Parse header line (Key: value)
        if (line.includes(':')) {
          const [key, ...valueParts] = line.split(':');
          const value = valueParts.join(':').trim();
          headers[key.trim().toLowerCase()] = value;
        }
      }

      // Extract body (original message)
      if (bodyStartIdx > 0 && bodyStartIdx < lines.length) {
        originalMessage = lines.slice(bodyStartIdx).join('\n');
      }

      // Build ARF report
      const report: ARFReport = {
        version: headers['version'] || '1.0',
        userAgent: headers['user-agent'],
        feedbackType: this.parseFeedbackType(headers['feedback-type']),
        timestamp: this.parseDate(headers['arrival-date']),
        originalHeaders: this.extractOriginalHeaders(originalMessage),
        originalMessage: this.truncateMessage(originalMessage),
        mimeVersion: headers['mime-version'] || '1.0',
        contentType: headers['content-type'] || 'multipart/report',
        sourceIP: headers['source-ip'],
        reportingMUA: headers['reporting-mua'],
        authFailure: headers['auth-failure'],
      };

      return report;
    } catch (error) {
      this.logger.error(`Failed to parse ARF: ${error.message}`);
      throw {
        code: 'ARF_PARSE_ERROR',
        message: 'Failed to parse ARF message',
        originalText: rawARF.substring(0, 200),
      } as ARFParseError;
    }
  }

  /**
   * Extract complaint information from ARF report
   */
  extractComplaint(arf: ARFReport): ComplaintInfo {
    const email = this.extractEmailFromOriginalHeaders(arf.originalHeaders);

    return {
      email,
      feedbackType: arf.feedbackType,
      timestamp: arf.timestamp,
      sourceIP: arf.sourceIP,
      userAgent: arf.userAgent,
      complaint: `${arf.feedbackType} complaint received`,
    };
  }

  /**
   * Extract auth failure information from ARF
   */
  extractAuthFailure(arf: ARFReport): AuthFailureReport | null {
    if (!arf.authFailure) {
      return null;
    }

    // Parse auth failure (e.g., "dkim" or "spf")
    const authMethod = arf.authFailure.toLowerCase() as 'dkim' | 'spf' | 'dmarc';
    const domain = arf.originalHeaders.from?.split('@')[1] || 'unknown';

    return {
      authMethod,
      domain,
      failure: arf.authFailure,
      timestamp: arf.timestamp,
    };
  }

  /**
   * Parse feedback type from string
   */
  private parseFeedbackType(feedbackTypeStr?: string): ARFFeedbackType {
    if (!feedbackTypeStr) {
      return 'other';
    }

    const normalized = feedbackTypeStr.toLowerCase().trim();
    return ARF_FEEDBACK_TYPE_MAP[normalized] || 'other';
  }

  /**
   * Parse date from various formats
   */
  private parseDate(dateStr?: string): Date {
    if (!dateStr) {
      return new Date();
    }

    try {
      return new Date(dateStr);
    } catch (error) {
      this.logger.warn(`Failed to parse date: ${dateStr}`);
      return new Date();
    }
  }

  /**
   * Extract original email headers from message body
   */
  private extractOriginalHeaders(
    originalMessage: string
  ): Record<string, any> {
    const headers: Record<string, any> = {};
    const lines = originalMessage.split('\n');

    for (const line of lines) {
      if (!line.trim()) {
        // End of headers
        break;
      }

      if (line.includes(':')) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        const normalizedKey = key.trim().toLowerCase();

        if (normalizedKey === 'message-id') {
          headers.messageID = value;
        } else if (normalizedKey === 'date') {
          try {
            headers.date = new Date(value);
          } catch (e) {
            headers.date = value;
          }
        } else if (normalizedKey === 'from') {
          headers.from = this.parseEmailAddress(value);
        } else if (normalizedKey === 'to') {
          headers.to = this.parseEmailAddress(value);
        } else if (normalizedKey === 'subject') {
          headers.subject = value;
        } else {
          headers[normalizedKey] = value;
        }
      }
    }

    return headers;
  }

  /**
   * Parse email address from field value
   * Handles: "Name <email@domain.com>" or just "email@domain.com"
   */
  private parseEmailAddress(value: string): string {
    const match = value.match(/<(.+?)>/);
    if (match) {
      return match[1];
    }
    return value.trim();
  }

  /**
   * Extract email from original headers
   */
  private extractEmailFromOriginalHeaders(headers: Record<string, any>): string {
    // Try to extract from To field
    if (headers.to) {
      const to = headers.to;
      if (typeof to === 'string') {
        return this.parseEmailAddress(to);
      }
    }

    // Try to extract from From field
    if (headers.from) {
      const from = headers.from;
      if (typeof from === 'string') {
        return this.parseEmailAddress(from);
      }
    }

    return 'unknown@unknown.com';
  }

  /**
   * Truncate message to 1000 chars for storage
   */
  private truncateMessage(message: string, maxLength: number = 1000): string {
    if (message.length > maxLength) {
      return message.substring(0, maxLength) + '...';
    }
    return message;
  }

  /**
   * Validate ARF report structure
   */
  validateARF(arf: ARFReport): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!arf.feedbackType) {
      errors.push('Missing feedback-type');
    }

    if (!arf.timestamp) {
      errors.push('Missing timestamp');
    }

    if (!arf.originalHeaders || !arf.originalHeaders.messageID) {
      errors.push('Missing original message-id');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate DSN report structure
   */
  static validateComplaintInfo(complaint: ComplaintInfo): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!complaint.email || !complaint.email.includes('@')) {
      errors.push('Invalid email address');
    }

    if (!complaint.feedbackType) {
      errors.push('Missing feedback type');
    }

    if (!complaint.timestamp) {
      errors.push('Missing timestamp');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
