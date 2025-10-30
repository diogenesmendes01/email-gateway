import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface ReputationMetrics {
  sent: number;
  delivered: number;
  bounced: number;
  bouncedHard: number;
  bouncedSoft: number;
  complained: number;
  opened: number;
  clicked: number;
  bounceRate: number;
  complaintRate: number;
  openRate: number;
  clickRate: number;
  reputationScore: number;
  trend: 'improving' | 'declining' | 'stable';
  lastUpdated: Date;
}

export interface ReputationAlert {
  id: string;
  type: 'high_bounce_rate' | 'high_complaint_rate' | 'low_reputation' | 'warmup_required';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value: number;
  threshold: number;
  createdAt: Date;
  acknowledged: boolean;
}

@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get company-wide reputation metrics
   */
  async getCompanyReputation(companyId: string): Promise<ReputationMetrics> {
    this.logger.log(`Getting reputation metrics for company: ${companyId}`);

    // Get last 30 days metrics
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const metrics = await this.prisma.reputationMetric.aggregate({
      where: {
        companyId,
        date: {
          gte: thirtyDaysAgo,
        },
      },
      _sum: {
        sent: true,
        delivered: true,
        bounced: true,
        bouncedHard: true,
        bouncedSoft: true,
        complained: true,
        opened: true,
        clicked: true,
      },
    });

    const sent = metrics._sum.sent || 0;
    const delivered = metrics._sum.delivered || 0;
    const bounced = metrics._sum.bounced || 0;
    const complained = metrics._sum.complained || 0;
    const opened = metrics._sum.opened || 0;
    const clicked = metrics._sum.clicked || 0;

    // Calculate rates
    const bounceRate = sent > 0 ? (bounced / sent) * 100 : 0;
    const complaintRate = sent > 0 ? (complained / sent) * 100 : 0;
    const openRate = delivered > 0 ? (opened / delivered) * 100 : 0;
    const clickRate = delivered > 0 ? (clicked / delivered) * 100 : 0;

    // Calculate reputation score (simplified algorithm)
    const reputationScore = this.calculateReputationScore(bounceRate, complaintRate, openRate, clickRate);

    // Calculate trend (compare with previous period)
    const previousPeriod = await this.getPreviousPeriodMetrics(companyId, thirtyDaysAgo);
    const trend = this.calculateTrend(reputationScore, previousPeriod?.reputationScore);

    return {
      sent,
      delivered,
      bounced,
      bouncedHard: metrics._sum.bouncedHard || 0,
      bouncedSoft: metrics._sum.bouncedSoft || 0,
      complained,
      opened,
      clicked,
      bounceRate,
      complaintRate,
      openRate,
      clickRate,
      reputationScore,
      trend,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get domain-specific reputation metrics
   */
  async getDomainReputation(domainId: string): Promise<ReputationMetrics> {
    this.logger.log(`Getting reputation metrics for domain: ${domainId}`);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const metrics = await this.prisma.reputationMetric.aggregate({
      where: {
        domainId,
        date: {
          gte: thirtyDaysAgo,
        },
      },
      _sum: {
        sent: true,
        delivered: true,
        bounced: true,
        bouncedHard: true,
        bouncedSoft: true,
        complained: true,
        opened: true,
        clicked: true,
      },
    });

    const sent = metrics._sum.sent || 0;
    const delivered = metrics._sum.delivered || 0;
    const bounced = metrics._sum.bounced || 0;
    const complained = metrics._sum.complained || 0;
    const opened = metrics._sum.opened || 0;
    const clicked = metrics._sum.clicked || 0;

    const bounceRate = sent > 0 ? (bounced / sent) * 100 : 0;
    const complaintRate = sent > 0 ? (complained / sent) * 100 : 0;
    const openRate = delivered > 0 ? (opened / delivered) * 100 : 0;
    const clickRate = delivered > 0 ? (clicked / delivered) * 100 : 0;

    const reputationScore = this.calculateReputationScore(bounceRate, complaintRate, openRate, clickRate);

    const previousPeriod = await this.getPreviousPeriodDomainMetrics(domainId, thirtyDaysAgo);
    const trend = this.calculateTrend(reputationScore, previousPeriod?.reputationScore);

    return {
      sent,
      delivered,
      bounced,
      bouncedHard: metrics._sum.bouncedHard || 0,
      bouncedSoft: metrics._sum.bouncedSoft || 0,
      complained,
      opened,
      clicked,
      bounceRate,
      complaintRate,
      openRate,
      clickRate,
      reputationScore,
      trend,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get active reputation alerts
   */
  async getActiveAlerts(companyId: string): Promise<ReputationAlert[]> {
    // Get current metrics
    const metrics = await this.getCompanyReputation(companyId);

    const alerts: ReputationAlert[] = [];

    // Check bounce rate
    if (metrics.bounceRate >= 2.0) {
      alerts.push({
        id: `bounce-${Date.now()}`,
        type: 'high_bounce_rate',
        severity: 'critical',
        message: `Bounce rate is ${metrics.bounceRate.toFixed(2)}%, above 2% threshold`,
        value: metrics.bounceRate,
        threshold: 2.0,
        createdAt: new Date(),
        acknowledged: false,
      });
    } else if (metrics.bounceRate >= 1.0) {
      alerts.push({
        id: `bounce-${Date.now()}`,
        type: 'high_bounce_rate',
        severity: 'high',
        message: `Bounce rate is ${metrics.bounceRate.toFixed(2)}%, above 1% threshold`,
        value: metrics.bounceRate,
        threshold: 1.0,
        createdAt: new Date(),
        acknowledged: false,
      });
    }

    // Check complaint rate
    if (metrics.complaintRate >= 0.1) {
      alerts.push({
        id: `complaint-${Date.now()}`,
        type: 'high_complaint_rate',
        severity: 'critical',
        message: `Complaint rate is ${metrics.complaintRate.toFixed(2)}%, above 0.1% threshold`,
        value: metrics.complaintRate,
        threshold: 0.1,
        createdAt: new Date(),
        acknowledged: false,
      });
    }

    // Check reputation score
    if (metrics.reputationScore < 50) {
      alerts.push({
        id: `reputation-${Date.now()}`,
        type: 'low_reputation',
        severity: 'high',
        message: `Reputation score is ${metrics.reputationScore}, below 50 threshold`,
        value: metrics.reputationScore,
        threshold: 50,
        createdAt: new Date(),
        acknowledged: false,
      });
    }

    return alerts;
  }

  /**
   * Get Gmail Postmaster Tools data (placeholder)
   */
  async getPostmasterData(companyId: string): Promise<any> {
    // TODO: Implement actual Gmail Postmaster Tools integration
    // This would require Gmail Postmaster Tools API access

    this.logger.warn('Postmaster Tools integration not yet implemented');

    return {
      available: false,
      message: 'Gmail Postmaster Tools integration not yet configured',
      domains: [],
    };
  }

  /**
   * Calculate reputation score based on metrics
   */
  private calculateReputationScore(
    bounceRate: number,
    complaintRate: number,
    openRate: number,
    clickRate: number
  ): number {
    // Simplified reputation scoring algorithm
    let score = 100;

    // Heavy penalties for high bounce/complaint rates
    score -= bounceRate * 2; // -2 points per 1% bounce
    score -= complaintRate * 100; // -100 points per 1% complaint

    // Bonuses for good engagement
    score += Math.min(openRate * 0.5, 10); // Up to +10 for opens
    score += Math.min(clickRate * 2, 15); // Up to +15 for clicks

    // Ensure score stays within 0-100 range
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Calculate trend compared to previous period
   */
  private calculateTrend(currentScore: number, previousScore?: number): 'improving' | 'declining' | 'stable' {
    if (!previousScore) return 'stable';

    const difference = currentScore - previousScore;

    if (difference > 5) return 'improving';
    if (difference < -5) return 'declining';
    return 'stable';
  }

  /**
   * Get previous period metrics for trend calculation
   */
  private async getPreviousPeriodMetrics(companyId: string, currentStartDate: Date): Promise<any> {
    const previousStart = new Date(currentStartDate);
    previousStart.setDate(previousStart.getDate() - 30);

    const previousEnd = new Date(currentStartDate);
    previousEnd.setDate(previousEnd.getDate() - 1);

    const metrics = await this.prisma.reputationMetric.aggregate({
      where: {
        companyId,
        date: {
          gte: previousStart,
          lte: previousEnd,
        },
      },
      _sum: {
        sent: true,
        delivered: true,
        bounced: true,
        complained: true,
        opened: true,
        clicked: true,
      },
    });

    const sent = metrics._sum.sent || 0;
    const bounced = metrics._sum.bounced || 0;
    const complained = metrics._sum.complained || 0;
    const delivered = metrics._sum.delivered || 0;
    const opened = metrics._sum.opened || 0;
    const clicked = metrics._sum.clicked || 0;

    const bounceRate = sent > 0 ? (bounced / sent) * 100 : 0;
    const complaintRate = sent > 0 ? (complained / sent) * 100 : 0;
    const openRate = delivered > 0 ? (opened / delivered) * 100 : 0;
    const clickRate = delivered > 0 ? (clicked / delivered) * 100 : 0;

    return {
      reputationScore: this.calculateReputationScore(bounceRate, complaintRate, openRate, clickRate),
    };
  }

  /**
   * Get previous period domain metrics
   */
  private async getPreviousPeriodDomainMetrics(domainId: string, currentStartDate: Date): Promise<any> {
    const previousStart = new Date(currentStartDate);
    previousStart.setDate(previousStart.getDate() - 30);

    const previousEnd = new Date(currentStartDate);
    previousEnd.setDate(previousEnd.getDate() - 1);

    const metrics = await this.prisma.reputationMetric.aggregate({
      where: {
        domainId,
        date: {
          gte: previousStart,
          lte: previousEnd,
        },
      },
      _sum: {
        sent: true,
        delivered: true,
        bounced: true,
        complained: true,
        opened: true,
        clicked: true,
      },
    });

    const sent = metrics._sum.sent || 0;
    const bounced = metrics._sum.bounced || 0;
    const complained = metrics._sum.complained || 0;
    const delivered = metrics._sum.delivered || 0;
    const opened = metrics._sum.opened || 0;
    const clicked = metrics._sum.clicked || 0;

    const bounceRate = sent > 0 ? (bounced / sent) * 100 : 0;
    const complaintRate = sent > 0 ? (complained / sent) * 100 : 0;
    const openRate = delivered > 0 ? (opened / delivered) * 100 : 0;
    const clickRate = delivered > 0 ? (clicked / delivered) * 100 : 0;

    return {
      reputationScore: this.calculateReputationScore(bounceRate, complaintRate, openRate, clickRate),
    };
  }
}
