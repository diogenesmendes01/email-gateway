import { Injectable, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '@packages/database';

/**
 * Métricas de reputação de email
 * Todas as taxas são em PERCENTUAL (0-100)
 */
export interface ReputationMetrics {
  sent: number;
  delivered: number;
  bounced: number;
  bouncedHard: number;
  bouncedSoft: number;
  complained: number;
  opened: number;
  clicked: number;
  bounceRate: number; // 0-100 (percentage)
  complaintRate: number; // 0-100 (percentage)
  openRate: number; // 0-100 (percentage)
  clickRate: number; // 0-100 (percentage)
  reputationScore: number; // 0-100 (score)
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

  // Thresholds (em percentual)
  private readonly BOUNCE_RATE_CRITICAL = 2.0; // 2%
  private readonly BOUNCE_RATE_HIGH = 1.0; // 1%
  private readonly COMPLAINT_RATE_CRITICAL = 0.1; // 0.1%
  private readonly REPUTATION_SCORE_WARNING = 50; // Score < 50

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obter métricas de reputação por empresa
   */
  async getCompanyReputation(companyId: string): Promise<ReputationMetrics> {
    try {
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

      // Calculate rates (em percentual: 0-100)
      const bounceRate = sent > 0 ? (bounced / sent) * 100 : 0;
      const complaintRate = sent > 0 ? (complained / sent) * 100 : 0;
      const openRate = delivered > 0 ? (opened / delivered) * 100 : 0;
      const clickRate = delivered > 0 ? (clicked / delivered) * 100 : 0;

      // Calculate reputation score
      const reputationScore = this.calculateReputationScore({
        bounceRate,
        complaintRate,
        openRate,
        clickRate,
      });

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
    } catch (error) {
      this.logger.error(`Failed to get company reputation: ${error.message}`);
      throw new InternalServerErrorException('Failed to calculate reputation metrics');
    }
  }

  /**
   * Obter métricas de reputação por domínio
   */
  async getDomainReputation(domainId: string): Promise<ReputationMetrics> {
    try {
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

      const reputationScore = this.calculateReputationScore({
        bounceRate,
        complaintRate,
        openRate,
        clickRate,
      });

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
    } catch (error) {
      this.logger.error(`Failed to get domain reputation: ${error.message}`);
      throw new InternalServerErrorException('Failed to calculate reputation metrics');
    }
  }

  /**
   * Obter alertas ativos de reputação
   */
  async getActiveAlerts(companyId: string): Promise<ReputationAlert[]> {
    try {
      const metrics = await this.getCompanyReputation(companyId);
      const alerts: ReputationAlert[] = [];

      // Check bounce rate (em %)
      if (metrics.bounceRate >= this.BOUNCE_RATE_CRITICAL) {
        alerts.push({
          id: `bounce-${Date.now()}`,
          type: 'high_bounce_rate',
          severity: 'critical',
          message: `Bounce rate is ${metrics.bounceRate.toFixed(2)}%, above ${this.BOUNCE_RATE_CRITICAL}% threshold`,
          value: metrics.bounceRate,
          threshold: this.BOUNCE_RATE_CRITICAL,
          createdAt: new Date(),
          acknowledged: false,
        });
      } else if (metrics.bounceRate >= this.BOUNCE_RATE_HIGH) {
        alerts.push({
          id: `bounce-${Date.now()}`,
          type: 'high_bounce_rate',
          severity: 'high',
          message: `Bounce rate is ${metrics.bounceRate.toFixed(2)}%, above ${this.BOUNCE_RATE_HIGH}% threshold`,
          value: metrics.bounceRate,
          threshold: this.BOUNCE_RATE_HIGH,
          createdAt: new Date(),
          acknowledged: false,
        });
      }

      // Check complaint rate (em %)
      if (metrics.complaintRate >= this.COMPLAINT_RATE_CRITICAL) {
        alerts.push({
          id: `complaint-${Date.now()}`,
          type: 'high_complaint_rate',
          severity: 'critical',
          message: `Complaint rate is ${metrics.complaintRate.toFixed(3)}%, above ${this.COMPLAINT_RATE_CRITICAL}% threshold`,
          value: metrics.complaintRate,
          threshold: this.COMPLAINT_RATE_CRITICAL,
          createdAt: new Date(),
          acknowledged: false,
        });
      }

      // Check reputation score
      if (metrics.reputationScore < this.REPUTATION_SCORE_WARNING) {
        alerts.push({
          id: `reputation-${Date.now()}`,
          type: 'low_reputation',
          severity: 'high',
          message: `Reputation score is ${metrics.reputationScore}, below ${this.REPUTATION_SCORE_WARNING} threshold`,
          value: metrics.reputationScore,
          threshold: this.REPUTATION_SCORE_WARNING,
          createdAt: new Date(),
          acknowledged: false,
        });
      }

      return alerts;
    } catch (error) {
      this.logger.error(`Failed to get active alerts: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve alerts');
    }
  }

  /**
   * Obter dados do Gmail Postmaster Tools (placeholder)
   */
  async getPostmasterData(companyId: string): Promise<any> {
    try {
      this.logger.warn('Postmaster Tools integration not yet implemented');

      return {
        available: false,
        message: 'Gmail Postmaster Tools integration not yet configured',
        domains: [],
      };
    } catch (error) {
      this.logger.error(`Failed to get Postmaster data: ${error.message}`);
      throw new InternalServerErrorException('Failed to retrieve Postmaster data');
    }
  }

  /**
   * Calcular score de reputação baseado em métricas
   * Score: 0-100
   * bounceRate, complaintRate, openRate, clickRate: 0-100 (em %)
   */
  private calculateReputationScore(metrics: {
    bounceRate: number;
    complaintRate: number;
    openRate: number;
    clickRate: number;
  }): number {
    let score = 100;

    // Penalidades por bounce rate
    if (metrics.bounceRate > this.BOUNCE_RATE_CRITICAL) {
      const excess = metrics.bounceRate - this.BOUNCE_RATE_CRITICAL;
      score -= excess * 50; // Penalidade proporcional ao excesso
    }

    // Penalidades por complaint rate (mais severo)
    if (metrics.complaintRate > this.COMPLAINT_RATE_CRITICAL) {
      const excess = metrics.complaintRate - this.COMPLAINT_RATE_CRITICAL;
      score -= excess * 500; // Penalidade muito severa
    }

    // Bônus por engagement (open rate + click rate)
    const engagementRate = (metrics.openRate + metrics.clickRate) / 2;
    score += engagementRate * 0.2; // Até +20 pontos

    // Garantir que score fica entre 0-100
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Calcular tendência comparando com período anterior
   */
  private calculateTrend(
    currentScore: number,
    previousScore?: number,
  ): 'improving' | 'declining' | 'stable' {
    if (!previousScore) return 'stable';

    const difference = currentScore - previousScore;

    if (difference > 5) return 'improving';
    if (difference < -5) return 'declining';
    return 'stable';
  }

  /**
   * Obter métricas do período anterior para cálculo de tendência
   */
  private async getPreviousPeriodMetrics(
    companyId: string,
    currentStartDate: Date,
  ): Promise<{ reputationScore: number } | null> {
    try {
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
      if (sent === 0) return null;

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
        reputationScore: this.calculateReputationScore({
          bounceRate,
          complaintRate,
          openRate,
          clickRate,
        }),
      };
    } catch (error) {
      this.logger.warn(`Failed to get previous period metrics: ${error.message}`);
      return null;
    }
  }

  /**
   * Obter métricas do período anterior por domínio
   */
  private async getPreviousPeriodDomainMetrics(
    domainId: string,
    currentStartDate: Date,
  ): Promise<{ reputationScore: number } | null> {
    try {
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
      if (sent === 0) return null;

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
        reputationScore: this.calculateReputationScore({
          bounceRate,
          complaintRate,
          openRate,
          clickRate,
        }),
      };
    } catch (error) {
      this.logger.warn(`Failed to get previous period domain metrics: ${error.message}`);
      return null;
    }
  }
}
