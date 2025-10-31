import { Injectable, Logger } from '@nestjs/common';
import { DSNParserService } from './dsn-parser.service';
import { ARFParserService } from './arf-parser.service';
import { ClassifiedBounce } from '../types/dsn-report.types';
import { ComplaintInfo, ARFReport } from '../types/arf-report.types';

export interface BounceAnalysis {
  type: 'bounce' | 'complaint' | 'auth_failure' | 'delivery';
  severity: 'critical' | 'high' | 'medium' | 'low';
  bounces: ClassifiedBounce[];
  complaints: ComplaintInfo[];
  requiresAction: boolean;
  recommendation: string;
}

/**
 * Bounce Classifier Service
 * Combines DSN and ARF parsing to classify and handle bounce scenarios
 */
@Injectable()
export class BounceClassifierService {
  private readonly logger = new Logger(BounceClassifierService.name);

  constructor(
    private readonly dsnParser: DSNParserService,
    private readonly arfParser: ARFParserService,
  ) {}

  /**
   * Analyze DSN for bounce classification
   */
  analyzeDSN(rawDSN: string): BounceAnalysis {
    try {
      const dsn = this.dsnParser.parseDSN(rawDSN);
      const classification = this.dsnParser.classifyBounce(dsn);
      const bounces = dsn.perRecipientFields || [];

      const classifiedBounces: ClassifiedBounce[] = bounces.map((recipient: any) => {
        const bounceType = classification.type === 'undetermined' ? 'soft' : classification.type;
        return {
          email: recipient.finalRecipient || recipient.originalRecipient || 'unknown@example.com',
          bounceType: bounceType as 'hard' | 'soft' | 'transient',
          action: recipient.action || 'failed',
          priority: this.getPriorityFromType(bounceType) as 'high' | 'medium' | 'low',
        };
      });

      const severity = this.calculateSeverity(classification.type === 'undetermined' ? 'soft' : classification.type);
      const recommendation = this.getRecommendation('bounce', classification.type === 'undetermined' ? 'soft' : classification.type);

      return {
        type: 'bounce',
        severity,
        bounces: classifiedBounces,
        complaints: [],
        requiresAction: classification.shouldSuppress,
        recommendation,
      };
    } catch (error) {
      this.logger.error(`Failed to analyze DSN: ${(error as Error).message}`);
      return {
        type: 'bounce',
        severity: 'low',
        bounces: [],
        complaints: [],
        requiresAction: false,
        recommendation: 'Failed to parse DSN message',
      };
    }
  }

  /**
   * Analyze ARF for complaint classification
   */
  analyzeARF(rawARF: string): BounceAnalysis {
    try {
      const arf = this.arfParser.parseARF(rawARF);
      const complaint = this.arfParser.extractComplaint(arf);

      const severity = this.getComplaintSeverity(arf.feedbackType);
      const recommendation = this.getRecommendation('complaint', arf.feedbackType);

      // Check if it's a not-spam complaint (positive signal)
      const requiresAction = arf.feedbackType !== 'not-spam';

      return {
        type: 'complaint',
        severity,
        bounces: [],
        complaints: [complaint],
        requiresAction,
        recommendation,
      };
    } catch (error) {
      this.logger.error(`Failed to analyze ARF: ${(error as Error).message}`);
      return {
        type: 'complaint',
        severity: 'low',
        bounces: [],
        complaints: [],
        requiresAction: false,
        recommendation: 'Failed to parse ARF message',
      };
    }
  }

  /**
   * Classify bounce and determine if suppression is needed
   */
  shouldSuppressEmail(bounceType: 'hard' | 'soft' | 'transient'): boolean {
    // Only suppress on hard bounces
    return bounceType === 'hard';
  }

  /**
   * Determine suppression expiry date
   */
  private calculateExpiryDate(bounceType: 'hard' | 'soft' | 'transient'): Date | undefined {
    const now = new Date();

    if (bounceType === 'hard') {
      // Hard bounces never expire
      return undefined;
    }

    if (bounceType === 'soft') {
      // Soft bounces expire after 30 days
      const expiryDate = new Date(now);
      expiryDate.setDate(expiryDate.getDate() + 30);
      return expiryDate;
    }

    if (bounceType === 'transient') {
      // Transient bounces expire after 7 days
      const expiryDate = new Date(now);
      expiryDate.setDate(expiryDate.getDate() + 7);
      return expiryDate;
    }

    return undefined;
  }

  /**
   * Calculate severity based on bounce type
   */
  private calculateSeverity(
    bounceType: 'hard' | 'soft' | 'transient',
  ): 'critical' | 'high' | 'medium' | 'low' {
    switch (bounceType) {
      case 'hard':
        return 'critical';
      case 'soft':
        return 'high';
      case 'transient':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Get complaint severity
   */
  private getComplaintSeverity(feedbackType: string): 'critical' | 'high' | 'medium' | 'low' {
    switch (feedbackType) {
      case 'fraud':
        return 'critical';
      case 'abuse':
        return 'high';
      case 'complaint':
        return 'medium';
      case 'auth-failure':
        return 'high';
      case 'not-spam':
        return 'low';
      case 'opt-out':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Get recommendation based on event type and classification
   */
  private getRecommendation(eventType: string, classification: string): string {
    if (eventType === 'bounce') {
      switch (classification) {
        case 'hard':
          return 'Add to suppression list immediately. This email will not accept messages.';
        case 'soft':
          return 'Monitor this email. Retry delivery with exponential backoff. Consider suppressing if bounces continue.';
        case 'transient':
          return 'Temporary issue detected. Retry delivery. Should resolve within 24 hours.';
        default:
          return 'Unknown bounce type. Monitor the email address.';
      }
    }

    if (eventType === 'complaint') {
      switch (classification) {
        case 'fraud':
          return 'HIGH PRIORITY: Fraud complaint received. Review sending practices immediately.';
        case 'abuse':
          return 'Spam complaint received. Review content and sending practices. Consider suppressing sender.';
        case 'complaint':
          return 'General complaint received. Review sending practices.';
        case 'auth-failure':
          return 'Authentication failure detected. Configure DKIM/SPF/DMARC records properly.';
        case 'not-spam':
          return 'Email marked as not spam. This is a positive signal. Consider as whitelisting.';
        case 'opt-out':
          return 'Unsubscribe request received. Remove from mailing list.';
        default:
          return 'Unknown complaint type. Review manual and take appropriate action.';
      }
    }

    return 'Unknown event type. Review manually.';
  }

  /**
   * Batch analyze multiple bounces
   */
  analyzeBatch(rawMessages: string[]): BounceAnalysis[] {
    return rawMessages.map(msg => {
      // Try to detect if it's DSN or ARF
      if (msg.includes('Feedback-Type')) {
        return this.analyzeARF(msg);
      } else if (msg.includes('Final-Recipient')) {
        return this.analyzeDSN(msg);
      } else {
        // Default to DSN
        return this.analyzeDSN(msg);
      }
    });
  }

  /**
   * Get action items from bounce analysis
   */
  getActionItems(analysis: BounceAnalysis): Array<{
    email: string;
    action: string;
    priority: 'high' | 'medium' | 'low';
  }> {
    const actions = [];

    // Actions for bounces
    for (const bounce of analysis.bounces) {
      if (bounce.bounceType === 'hard') {
        actions.push({
          email: bounce.email,
          action: `Add to suppression list (${bounce.bounceType})`,
          priority: 'high' as const,
        });
      } else if (bounce.bounceType === 'soft') {
        actions.push({
          email: bounce.email,
          action: 'Retry with backoff',
          priority: 'medium' as const,
        });
      }
    }

    // Actions for complaints
    for (const complaint of analysis.complaints) {
      if (complaint.feedbackType === 'abuse' || complaint.feedbackType === 'fraud') {
        actions.push({
          email: complaint.email,
          action: `Mark as complaint (${complaint.feedbackType})`,
          priority: 'high' as const,
        });
      } else if (complaint.feedbackType === 'opt-out') {
        actions.push({
          email: complaint.email,
          action: 'Unsubscribe from list',
          priority: 'high' as const,
        });
      } else if (complaint.feedbackType === 'not-spam') {
        actions.push({
          email: complaint.email,
          action: 'Whitelist/trusted sender',
          priority: 'low' as const,
        });
      }
    }

    return actions;
  }

  /**
   * Get priority level from bounce type
   */
  private getPriorityFromType(bounceType: string): string {
    switch (bounceType) {
      case 'hard':
        return 'high';
      case 'soft':
        return 'medium';
      case 'transient':
        return 'low';
      default:
        return 'medium';
    }
  }
}
