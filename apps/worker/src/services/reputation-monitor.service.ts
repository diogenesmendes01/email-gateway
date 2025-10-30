import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@packages/database';

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
  sentToday: number;
}

/**
 * Reputation Monitor Service - TRACK 2
 * Semana 7-8: Reputação & Guardrails
 * Monitora métricas de reputação e aplica guardrails automáticos
 */
@Injectable()
export class ReputationMonitorService {
  private readonly logger = new Logger(ReputationMonitorService.name);

  // Guardrails (conforme documentação)
  private readonly BOUNCE_RATE_THRESHOLD = 0.02; // 2%
  private readonly COMPLAINT_RATE_THRESHOLD = 0.001; // 0.1%

  constructor(private prisma: PrismaService) {}

  /**
   * Verificar e aplicar guardrails para uma empresa
   */
  async checkAndEnforce(companyId: string): Promise<{
    bounceRateViolation: boolean;
    complaintRateViolation: boolean;
    actions: string[];
  }> {
    try {
      const metrics = await this.calculateLast24hMetrics(companyId);

      const actions: string[] = [];
      let bounceViolation = false;
      let complaintViolation = false;

      // Guardrail 1: Bounce Rate ≥ 2%
      if (metrics.bounceRate >= this.BOUNCE_RATE_THRESHOLD) {
        this.logger.warn(
          `HIGH BOUNCE RATE for company ${companyId}: ${(metrics.bounceRate * 100).toFixed(2)}%`
        );

        await this.pauseSending(
          companyId,
          `High bounce rate detected: ${(metrics.bounceRate * 100).toFixed(2)}%`
        );

        await this.sendAlert(companyId, {
          type: 'high_bounce_rate',
          value: metrics.bounceRate,
          threshold: this.BOUNCE_RATE_THRESHOLD,
          message: `Bounce rate reached ${(metrics.bounceRate * 100).toFixed(2)}%. Sending has been paused.`,
        });

        actions.push('paused_sending_high_bounce_rate');
        bounceViolation = true;
      }

      // Guardrail 2: Complaint Rate ≥ 0.1%
      if (metrics.complaintRate >= this.COMPLAINT_RATE_THRESHOLD) {
        this.logger.warn(
          `HIGH COMPLAINT RATE for company ${companyId}: ${(metrics.complaintRate * 100).toFixed(3)}%`
        );

        await this.pauseSending(
          companyId,
          `High complaint rate detected: ${(metrics.complaintRate * 100).toFixed(3)}%`
        );

        await this.sendAlert(companyId, {
          type: 'high_complaint_rate',
          value: metrics.complaintRate,
          threshold: this.COMPLAINT_RATE_THRESHOLD,
          message: `Complaint rate reached ${(metrics.complaintRate * 100).toFixed(3)}%. Sending has been paused.`,
        });

        actions.push('paused_sending_high_complaint_rate');
        complaintViolation = true;
      }

      // Guardrail 3: Warm-up (se habilitado)
      const warmupLimit = await this.getWarmupLimit(companyId);
      if (warmupLimit && metrics.sentToday >= warmupLimit) {
        this.logger.warn(
          `Warm-up limit reached for company ${companyId}: ${metrics.sentToday}/${warmupLimit}`
        );

        await this.throttleSending(
          companyId,
          `Daily warm-up limit reached: ${metrics.sentToday}/${warmupLimit}`
        );

        actions.push('throttled_sending_warmup_limit');
      }

      // Guardrail 4: Reputation Score
      const reputationScore = this.calculateReputationScore(metrics);
      if (reputationScore < 50) {
        this.logger.error(
          `CRITICAL REPUTATION SCORE for company ${companyId}: ${reputationScore.toFixed(2)}`
        );

        await this.pauseSending(
          companyId,
          `Critical reputation score: ${reputationScore.toFixed(2)}`
        );

        await this.sendAlert(companyId, {
          type: 'critical_reputation_score',
          value: reputationScore,
          threshold: 50,
          message: `Reputation score critically low (${reputationScore.toFixed(2)}). Sending has been paused.`,
        });

        actions.push('paused_sending_critical_reputation');
      }

      return {
        bounceRateViolation: bounceViolation,
        complaintRateViolation: complaintViolation,
        actions,
      };
    } catch (error) {
      this.logger.error(
        `Failed to check and enforce reputation: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Calcular métricas das últimas 24 horas
   */
  private async calculateLast24hMetrics(companyId: string): Promise<ReputationMetrics> {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [
        sentCount,
        deliveredCount,
        bouncedCount,
        bouncedHardCount,
        bouncedSoftCount,
        complainedCount,
        openedCount,
        clickedCount,
      ] = await Promise.all([
        this.prisma.emailLog.count({
          where: {
            companyId,
            status: 'SENT',
            sentAt: { gte: since },
          },
        }),
        this.prisma.emailLog.count({
          where: {
            companyId,
            status: 'SENT',
            deliveryTimestamp: { gte: since },
          },
        }),
        this.prisma.emailLog.count({
          where: {
            companyId,
            bounceType: { not: null },
            createdAt: { gte: since },
          },
        }),
        this.prisma.emailLog.count({
          where: {
            companyId,
            bounceType: 'PERMANENT',
            createdAt: { gte: since },
          },
        }),
        this.prisma.emailLog.count({
          where: {
            companyId,
            bounceType: 'TRANSIENT',
            createdAt: { gte: since },
          },
        }),
        this.prisma.emailLog.count({
          where: {
            companyId,
            complaintFeedbackType: { not: null },
            createdAt: { gte: since },
          },
        }),
        this.prisma.emailTracking.count({
          where: {
            emailLog: { companyId },
            openedAt: { gte: since },
          },
        }),
        this.prisma.emailTracking.count({
          where: {
            emailLog: { companyId },
            clickedAt: { gte: since },
          },
        }),
      ]);

      const metrics: ReputationMetrics = {
        sent: sentCount,
        delivered: deliveredCount,
        bounced: bouncedCount,
        bouncedHard: bouncedHardCount,
        bouncedSoft: bouncedSoftCount,
        complained: complainedCount,
        opened: openedCount,
        clicked: clickedCount,
        bounceRate: sentCount > 0 ? bouncedCount / sentCount : 0,
        complaintRate: sentCount > 0 ? complainedCount / sentCount : 0,
        openRate: sentCount > 0 ? openedCount / sentCount : 0,
        clickRate: sentCount > 0 ? clickedCount / sentCount : 0,
        sentToday: sentCount,
      };

      return metrics;
    } catch (error) {
      this.logger.error(`Failed to calculate metrics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pausar envios de uma empresa
   */
  private async pauseSending(companyId: string, reason: string): Promise<void> {
    try {
      await this.prisma.company.update({
        where: { id: companyId },
        data: {
          isSuspended: true,
          suspensionReason: reason,
        },
      });

      this.logger.warn(`Company ${companyId} suspended: ${reason}`);
    } catch (error) {
      this.logger.error(`Failed to pause sending: ${error.message}`);
    }
  }

  /**
   * Limitar (throttle) envios de uma empresa
   */
  private async throttleSending(companyId: string, reason: string): Promise<void> {
    try {
      // Implementar rate limiting via Redis/RateLimit model
      await this.prisma.rateLimit.upsert({
        where: {
          idx_scope_target: {
            scope: 'CUSTOMER_DOMAIN',
            target: companyId,
          } as any,
        },
        create: {
          scope: 'CUSTOMER_DOMAIN',
          target: companyId,
          perDay: 1000, // Exemplo: 1000 emails por dia
        },
        update: {
          perDay: 1000,
        },
      });

      this.logger.warn(`Company ${companyId} throttled: ${reason}`);
    } catch (error) {
      this.logger.error(`Failed to throttle sending: ${error.message}`);
    }
  }

  /**
   * Enviar alerta para a empresa
   */
  private async sendAlert(
    companyId: string,
    alert: {
      type: string;
      value: number;
      threshold: number;
      message: string;
    }
  ): Promise<void> {
    try {
      // Implementar envio de alerta (email, Slack, etc)
      this.logger.log(`ALERT for company ${companyId}: ${alert.message}`);

      // Salvar em banco de dados para dashboard
      // await this.prisma.alert.create({ ... });
    } catch (error) {
      this.logger.error(`Failed to send alert: ${error.message}`);
    }
  }

  /**
   * Obter limite de warm-up
   */
  private async getWarmupLimit(companyId: string): Promise<number | null> {
    try {
      const domain = await this.prisma.domain.findFirst({
        where: { companyId, warmupEnabled: true },
      });

      if (!domain || !domain.warmupConfig) {
        return null;
      }

      const config = domain.warmupConfig as any;
      const daysSinceStart = Math.floor(
        (Date.now() - new Date(domain.warmupStartDate!).getTime()) /
          (24 * 60 * 60 * 1000)
      );

      return this.calculateWarmupLimit(daysSinceStart, config);
    } catch (error) {
      this.logger.error(`Failed to get warmup limit: ${error.message}`);
      return null;
    }
  }

  /**
   * Calcular limite de warm-up baseado em dias
   */
  private calculateWarmupLimit(day: number, config: any): number {
    // Exemplo de progressão de warm-up:
    // Dia 1: 50 emails
    // Dia 2: 100 emails
    // Dia 3: 200 emails
    // Dia 4: 400 emails
    // ...crescimento exponencial até limite máximo

    const baseVolume = config.startVolume || 50;
    const dailyIncrease = config.dailyIncrease || 1.5; // 50% de aumento por dia
    const maxVolume = config.maxDailyVolume || 100000;

    const limit = Math.floor(baseVolume * Math.pow(dailyIncrease, day));
    return Math.min(limit, maxVolume);
  }

  /**
   * Calcular score de reputação
   */
  private calculateReputationScore(metrics: ReputationMetrics): number {
    // Score de 0-100 baseado em métricas
    let score = 100;

    // Penalidade por bounce rate
    if (metrics.bounceRate > this.BOUNCE_RATE_THRESHOLD) {
      const excess = metrics.bounceRate - this.BOUNCE_RATE_THRESHOLD;
      score -= excess * 1000; // Penalidade severa
    }

    // Penalidade por complaint rate
    if (metrics.complaintRate > this.COMPLAINT_RATE_THRESHOLD) {
      const excess = metrics.complaintRate - this.COMPLAINT_RATE_THRESHOLD;
      score -= excess * 10000; // Penalidade muito severa
    }

    // Bônus por engagement
    const engagementRate = (metrics.openRate + metrics.clickRate) / 2;
    score += engagementRate * 20; // Até 20 pontos de bônus

    // Garantir score entre 0 e 100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Salvar métrica de reputação diária
   */
  async saveReputationMetric(companyId: string): Promise<void> {
    try {
      const metrics = await this.calculateLast24hMetrics(companyId);
      const score = this.calculateReputationScore(metrics);

      await this.prisma.reputationMetric.create({
        data: {
          companyId,
          date: new Date().toISOString().split('T')[0],
          sent: metrics.sent,
          delivered: metrics.delivered,
          bounced: metrics.bounced,
          bouncedHard: metrics.bouncedHard,
          bouncedSoft: metrics.bouncedSoft,
          complained: metrics.complained,
          opened: metrics.opened,
          clicked: metrics.clicked,
          bounceRate: metrics.bounceRate,
          complaintRate: metrics.complaintRate,
          openRate: metrics.openRate,
          clickRate: metrics.clickRate,
          reputationScore: score,
        },
      });

      this.logger.log(
        `Reputation metric saved for ${companyId}: score=${score.toFixed(2)}`
      );
    } catch (error) {
      this.logger.error(`Failed to save reputation metric: ${error.message}`);
    }
  }

  /**
   * Limpar supressões expiradas
   */
  async cleanupExpiredSuppressions(): Promise<number> {
    try {
      const result = await this.prisma.suppression.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      this.logger.log(`Cleaned up ${result.count} expired suppressions`);
      return result.count;
    } catch (error) {
      this.logger.error(`Failed to cleanup suppressions: ${error.message}`);
      throw error;
    }
  }
}
