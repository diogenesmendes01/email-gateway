import { Injectable, Logger } from '@nestjs/common';
import {
  ARFReport,
  ComplaintInfo,
  ARFFeedbackType,
  ARF_FEEDBACK_TYPE_MAP,
  ARFParseError,
} from '../types/arf-report.types';

/**
 * ARF Parser Service (RFC 5965)
 * Parses Abuse Reporting Format messages to extract complaint/abuse information
 *
 * ARF Structure (RFC 5965):
 * - multipart/report message
 * - First part: human-readable explanation (optional)
 * - Second part: machine-readable ARF headers
 * - Third part: original message (optional)
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
      this.logger.debug(`Parsing ARF message (${rawARF.length} chars)`);

      // Handle empty ARF
      if (!rawARF || rawARF.trim().length === 0) {
        return {
          version: '1.0',
          feedbackType: 'other' as any,
          timestamp: new Date(),
          mimeVersion: '1.0',
          contentType: 'message/feedback-report',
          originalHeaders: {},
        } as ARFReport;
      }

      // ARF messages are multipart/report
      // Extract the feedback-report part (machine-readable)
      const feedbackReportPart = this.extractFeedbackReportPart(rawARF);

      if (!feedbackReportPart) {
        throw new Error('No feedback-report part found in ARF');
      }

      // Parse the feedback report content
      const report = this.parseFeedbackReport(feedbackReportPart);

      // Try to extract original message if present
      report.originalMessage = this.extractOriginalMessage(rawARF);

      this.logger.debug(`Successfully parsed ARF: ${report.feedbackType} from ${report.userAgent}`);
      return report;
    } catch (error) {
      this.logger.error(`ARF parsing failed: ${(error as Error).message}`);
      throw new ARFParseError('ARF_PARSING_FAILED', `Failed to parse ARF: ${(error as Error).message}`);
    }
  }

  /**
   * Extract the feedback-report part from multipart ARF
   * RFC 5965 Section 3
   */
  private extractFeedbackReportPart(rawARF: string): string | null {
    // ARF is multipart/report with Content-Type: message/feedback-report
    const boundaryMatch = rawARF.match(/boundary="([^"]+)"/) || rawARF.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) {
      // Not multipart, check if it's a simple feedback report
      if (rawARF.includes('Feedback-Type:') || rawARF.includes('Version:')) {
        return rawARF;
      }
      return null;
    }

    const boundary = boundaryMatch[1];
    const parts = rawARF.split(`--${boundary}`);

    for (const part of parts) {
      if (part.includes('Content-Type: message/feedback-report') ||
          part.includes('Feedback-Type:') ||
          part.includes('Version:')) {
        // Extract content after headers
        const contentStart = part.indexOf('\n\n');
        if (contentStart !== -1) {
          return part.substring(contentStart + 2).trim();
        }
        return part.trim();
      }
    }

    return null;
  }

  /**
   * Parse the feedback-report content
   * RFC 5965 Section 3
   */
  private parseFeedbackReport(content: string): ARFReport {
    const lines = content.split('\n').map(line => line.trim());
    const report: Partial<ARFReport> = {
      originalHeaders: {},
    };

    let inOriginalHeaders = false;
    let originalHeadersBuffer: string[] = [];

    for (const line of lines) {
      if (!line) continue;

      if (line.includes(':')) {
        const [key, ...valueParts] = line.split(':');
        const headerKey = key.trim();
        const headerValue = valueParts.join(':').trim();

        // RFC 5965 required headers
        switch (headerKey.toLowerCase()) {
          case 'version':
            report.version = headerValue;
            break;
          case 'user-agent':
            report.userAgent = headerValue;
            break;
          case 'feedback-type':
            report.feedbackType = this.parseFeedbackType(headerValue);
            break;
          case 'original-mail-from':
          case 'from':
            if (!report.originalHeaders!.from) {
              report.originalHeaders!.from = headerValue;
            }
            break;
          case 'original-rcpt-to':
          case 'to':
            if (!report.originalHeaders!.to) {
              report.originalHeaders!.to = headerValue;
            } else if (typeof report.originalHeaders!.to === 'string') {
              report.originalHeaders!.to = report.originalHeaders!.to + ', ' + headerValue;
            } else {
              report.originalHeaders!.to = headerValue;
            }
            break;
          case 'received-date':
          case 'arrival-date':
            report.originalHeaders!.date = new Date(headerValue);
            report.timestamp = new Date(headerValue);
            break;
          case 'message-id':
            report.originalHeaders!.messageID = headerValue;
            break;
          case 'subject':
            report.originalHeaders!.subject = headerValue;
            break;
          case 'source-ip':
            report.sourceIP = headerValue;
            break;
          case 'reporting-mua':
            report.reportingMUA = headerValue;
            break;
          case 'reported-domain':
            // Can be used for additional validation
            break;
          case 'authentication-results':
            report.authFailure = headerValue;
            break;
          case 'auth-failure':
            report.authFailureType = headerValue;
            break;
          case 'removal-recipient':
            // Additional recipient information
            break;
          default:
            // Store other headers
            if (headerKey.toLowerCase().startsWith('x-') ||
                headerKey.toLowerCase().startsWith('original-')) {
              report.originalHeaders![headerKey] = headerValue;
            }
            break;
        }
      }
    }

    // Set defaults if not provided
    if (!report.version) report.version = '1.0';
    // Do NOT set default feedbackType - let validateARF catch this
    if (!report.timestamp) report.timestamp = new Date();

    // MIME version and content type are standard for ARF
    report.mimeVersion = '1.0';
    report.contentType = 'message/feedback-report';

    return report as ARFReport;
  }

  /**
   * Extract original message from ARF (if present)
   */
  private extractOriginalMessage(rawARF: string): string | undefined {
    const MAX_MESSAGE_LENGTH = 1000;

    const boundaryMatch = rawARF.match(/boundary="([^"]+)"/) || rawARF.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) {
      // No boundary, check if there's content after empty lines
      const parts = rawARF.split('\n\n');
      if (parts.length > 1) {
        let message = parts.slice(1).join('\n\n').trim();
        if (message.length > MAX_MESSAGE_LENGTH) {
          message = message.substring(0, MAX_MESSAGE_LENGTH) + '...';
        }
        return message || undefined;
      }
      return undefined;
    }

    const boundary = boundaryMatch[1];
    const parts = rawARF.split(`--${boundary}`);

    // Look for the part after the feedback-report
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.includes('Content-Type: message/feedback-report') ||
          part.includes('Feedback-Type:')) {
        // Next part should be the original message
        if (i + 1 < parts.length) {
          const nextPart = parts[i + 1];
          const contentStart = nextPart.indexOf('\n\n');
          let message: string;
          if (contentStart !== -1) {
            message = nextPart.substring(contentStart + 2).trim();
          } else {
            message = nextPart.trim();
          }

          // Truncate if too long
          if (message.length > MAX_MESSAGE_LENGTH) {
            message = message.substring(0, MAX_MESSAGE_LENGTH) + '...';
          }

          return message;
        }
        break;
      }
    }

    return undefined;
  }

  /**
   * Parse feedback type from header value
   */
  private parseFeedbackType(feedbackTypeStr: string): ARFFeedbackType {
    const normalized = feedbackTypeStr.toLowerCase().trim();

    // Check if it's a known feedback type
    if (ARF_FEEDBACK_TYPE_MAP[normalized]) {
      return ARF_FEEDBACK_TYPE_MAP[normalized];
    }

    // Try to match partial strings
    for (const [key, value] of Object.entries(ARF_FEEDBACK_TYPE_MAP)) {
      if (normalized.includes(key)) {
        return value;
      }
    }

    // Check for common variations and patterns
    if (normalized.includes('spam') || normalized.includes('abuse') || normalized.includes('bulk')) {
      return 'abuse';
    }
    if (normalized.includes('fraud') || normalized.includes('phish') || normalized.includes('scam')) {
      return 'fraud';
    }
    if (normalized.includes('auth') || normalized.includes('dkim') || normalized.includes('spf') || normalized.includes('dmarc')) {
      return 'auth-failure';
    }
    if (normalized.includes('complaint') || normalized.includes('report')) {
      return 'complaint';
    }
    if (normalized.includes('not-spam') || normalized.includes('whitelist') || normalized.includes('good')) {
      return 'not-spam';
    }
    if (normalized.includes('opt-out') || normalized.includes('unsubscribe') || normalized.includes('remove')) {
      return 'opt-out';
    }

    // Default to other
    return 'other';
  }

  /**
   * Extract complaint information from ARF report
   */
  extractComplaint(arf: ARFReport): ComplaintInfo {
    // Try to extract email from various header fields
    let email = 'unknown@example.com';

    // Try original-rcpt-to first (most reliable)
    if (arf.originalHeaders['original-rcpt-to']) {
      const rcptTo = arf.originalHeaders['original-rcpt-to'];
      if (Array.isArray(rcptTo)) {
        email = rcptTo[0];
      } else {
        email = rcptTo as string;
      }
    }
    // Try to field
    else if (arf.originalHeaders.to) {
      const toField = arf.originalHeaders.to;
      if (Array.isArray(toField)) {
        email = toField[0];
      } else {
        email = toField as string;
      }
    }
    // Try from field (less common but possible)
    else if (arf.originalHeaders.from) {
      email = arf.originalHeaders.from as string;
    }

    // Clean up email (remove display names, angle brackets, etc.)
    email = this.extractEmailFromHeader(email);

    return {
      email,
      feedbackType: arf.feedbackType,
      timestamp: arf.timestamp,
      sourceIP: arf.sourceIP,
      userAgent: arf.userAgent,
      complaint: this.generateComplaintDescription(arf),
    };
  }

  /**
   * Extract clean email address from header field
   */
  private extractEmailFromHeader(headerValue: string): string {
    if (!headerValue) return 'unknown@example.com';

    // Remove display name: "Display Name" <email@domain.com>
    const angleBracketMatch = headerValue.match(/<([^>]+)>/);
    if (angleBracketMatch) {
      return angleBracketMatch[1].trim();
    }

    // Remove quotes and extra spaces
    let clean = headerValue.replace(/["']/g, '').trim();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(clean)) {
      return clean;
    }

    // If no valid email found, return unknown
    return 'unknown@example.com';
  }

  /**
   * Extract authentication failure information from ARF report
   */
  extractAuthFailure(arf: ARFReport): import('../types/arf-report.types').AuthFailureReport | null {
    if (arf.feedbackType !== 'auth-failure') {
      return null;
    }

    // Check if we have auth failure type directly
    let authMethod: 'dkim' | 'spf' | 'dmarc' = 'dkim';

    if (arf.authFailureType) {
      const authType = arf.authFailureType.toLowerCase();
      if (authType.includes('spf')) {
        authMethod = 'spf';
      } else if (authType.includes('dmarc')) {
        authMethod = 'dmarc';
      } else if (authType.includes('dkim')) {
        authMethod = 'dkim';
      }
    } else if (arf.authFailure) {
      // Parse authentication failure details from results
      const authFailure = arf.authFailure.toLowerCase();

      if (authFailure.includes('spf')) {
        authMethod = 'spf';
      } else if (authFailure.includes('dmarc')) {
        authMethod = 'dmarc';
      }
    }

    // Extract domain from headers if possible
    let domain = 'unknown';
    if (arf.originalHeaders.from) {
      const fromEmail = this.extractEmailFromHeader(arf.originalHeaders.from as string);
      const atIndex = fromEmail.indexOf('@');
      if (atIndex !== -1) {
        domain = fromEmail.substring(atIndex + 1);
      }
    }

    return {
      authMethod,
      domain,
      failure: arf.authFailure,
      timestamp: arf.timestamp,
    };
  }

  /**
   * Generate human-readable complaint description
   */
  private generateComplaintDescription(arf: ARFReport): string {
    const descriptions: Record<ARFFeedbackType, string> = {
      'abuse': 'Email marked as spam/abuse by recipient',
      'fraud': 'Email reported as fraudulent/phishing attempt',
      'auth-failure': 'Email failed authentication checks',
      'not-spam': 'Email incorrectly marked as spam (false positive)',
      'complaint': 'General recipient complaint about email',
      'opt-out': 'Recipient requested to unsubscribe/opt-out',
      'other': 'Other type of complaint or feedback',
    };

    let description = descriptions[arf.feedbackType] || 'Unknown complaint type';

    if (arf.sourceIP) {
      description += ` from IP ${arf.sourceIP}`;
    }

    if (arf.userAgent) {
      description += ` via ${arf.userAgent}`;
    }

    return description;
  }

  /**
   * Validate ARF report structure
   */
  validateARF(arf: ARFReport): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // RFC 5965 required fields
    if (!arf.feedbackType || arf.feedbackType === 'other' as any) {
      errors.push('Missing feedback-type');
    }

    // Version is optional in practice, though recommended
    // if (!arf.version) {
    //   errors.push('Missing recommended Version header');
    // }

    // Timestamp should be set
    if (!arf.timestamp) {
      errors.push('Missing timestamp');
    }

    // At least some original headers should be present
    const hasOriginalHeaders = arf.originalHeaders &&
      (arf.originalHeaders.messageID || arf.originalHeaders.subject ||
       arf.originalHeaders.from || arf.originalHeaders.to);

    if (!hasOriginalHeaders) {
      errors.push('Missing original message headers');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
