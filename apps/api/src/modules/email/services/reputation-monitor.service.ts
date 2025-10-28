/**
 * @email-gateway/api - Reputation Monitor Service
 *
 * Service para monitorar reputação de envios por empresa
 *
 * TASK-030: Reputation Monitor Service
 * Calcula bounce/complaint rates e suspende empresas automaticamente
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { prisma } from '@email-gateway/database';

/**
 * Resultado do cálculo de métricas de reputação
 */
export interface ReputationMetrics {
  bounceRate: number;
  complaintRate: number;
  totalSent: number;
  totalBounces: number;
  totalComplaints: number;
}

/**
 * Service de monitoramento de reputação
 * Kill switch automático para proteção da conta AWS
 */
@Injectable()
export class ReputationMonitorService {
  private readonly logger = new Logger(ReputationMonitorService.name);

  // Thresholds de segurança (AWS suspende em 10% bounce e 0.5% complaint)
  private readonly BOUNCE_THRESHOLD = 5; // 5%
  private readonly COMPLAINT_THRESHOLD = 0.1; // 0.1%

  /**
   * Calcula bounce e complaint rates dos últimos 7 dias
   * TASK-030: Calculate rates from last 7 days
   */
  async calculateRates(companyId: string): Promise<ReputationMetrics> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Total de emails enviados com sucesso nos últimos 7 dias
      const totalSent = await prisma.emailLog.count({
        where: {
          companyId,
          status: 'SENT',
          sentAt: { gte: sevenDaysAgo },
        },
      });

      // Total de bounces permanentes
      const totalBounces = await prisma.emailLog.count({
        where: {
          companyId,
          bounceType: 'Permanent',
          createdAt: { gte: sevenDaysAgo },
        },
      });

      // Total de complaints
      const totalComplaints = await prisma.emailLog.count({
        where: {
          companyId,
          complaintFeedbackType: { not: null },
          createdAt: { gte: sevenDaysAgo },
        },
      });

      // Calcula percentuais
      const bounceRate = totalSent > 0 ? (totalBounces / totalSent) * 100 : 0;
      const complaintRate = totalSent > 0 ? (totalComplaints / totalSent) * 100 : 0;

      this.logger.debug({
        message: 'Reputation metrics calculated',
        companyId,
        totalSent,
        totalBounces,
        totalComplaints,
        bounceRate: bounceRate.toFixed(2),
        complaintRate: complaintRate.toFixed(2),
      });

      return {
        bounceRate,
        complaintRate,
        totalSent,
        totalBounces,
        totalComplaints,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Failed to calculate reputation rates',
        companyId,
        error: errorMessage,
      });

      throw new Error(`Failed to calculate reputation rates: ${errorMessage}`);
    }
  }

  /**
   * Verifica métricas e suspende empresa se necessário
   * TASK-030: Kill switch - suspend if thresholds exceeded
   */
  async checkAndSuspend(companyId: string): Promise<void> {
    try {
      const rates = await this.calculateRates(companyId);

      // Atualiza cache de métricas na empresa
      await prisma.company.update({
        where: { id: companyId },
        data: {
          bounceRate: rates.bounceRate,
          complaintRate: rates.complaintRate,
          lastMetricsUpdate: new Date(),
        },
      });

      // Verifica bounce rate threshold
      if (rates.bounceRate > this.BOUNCE_THRESHOLD) {
        await this.suspendCompany(
          companyId,
          `High bounce rate: ${rates.bounceRate.toFixed(2)}% (threshold: ${this.BOUNCE_THRESHOLD}%)`,
        );
        return;
      }

      // Verifica complaint rate threshold
      if (rates.complaintRate > this.COMPLAINT_THRESHOLD) {
        await this.suspendCompany(
          companyId,
          `High complaint rate: ${rates.complaintRate.toFixed(2)}% (threshold: ${this.COMPLAINT_THRESHOLD}%)`,
        );
        return;
      }

      this.logger.debug({
        message: 'Company metrics within acceptable limits',
        companyId,
        bounceRate: rates.bounceRate.toFixed(2),
        complaintRate: rates.complaintRate.toFixed(2),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Failed to check and suspend company',
        companyId,
        error: errorMessage,
      });

      // Não propaga erro para não quebrar o cron job
    }
  }

  /**
   * Suspende uma empresa com razão específica
   * TASK-030: Suspend company with reason
   */
  private async suspendCompany(companyId: string, reason: string): Promise<void> {
    try {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          isSuspended: true,
          suspensionReason: reason,
        },
      });

      this.logger.warn({
        message: 'Company suspended automatically',
        companyId,
        reason,
      });

      // TODO: Enviar alerta (Slack, email, etc.)
      // this.alertService.sendAlert({ companyId, reason });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Failed to suspend company',
        companyId,
        reason,
        error: errorMessage,
      });

      throw new Error(`Failed to suspend company: ${errorMessage}`);
    }
  }

  /**
   * Cron job: monitora todas empresas ativas a cada hora
   * TASK-030: Hourly monitoring of all active companies
   */
  @Cron(CronExpression.EVERY_HOUR)
  async monitorAllCompanies(): Promise<void> {
    this.logger.log({
      message: 'Starting hourly reputation monitoring',
      timestamp: new Date().toISOString(),
    });

    try {
      // Busca empresas ativas e não suspensas
      const companies = await prisma.company.findMany({
        where: {
          isActive: true,
          isSuspended: false,
        },
        select: {
          id: true,
          name: true,
        },
      });

      this.logger.log({
        message: 'Found companies to monitor',
        count: companies.length,
      });

      // Monitora cada empresa sequencialmente
      let checkedCount = 0;
      let suspendedCount = 0;

      for (const company of companies) {
        try {
          const beforeSuspended = await prisma.company.findUnique({
            where: { id: company.id },
            select: { isSuspended: true },
          });

          await this.checkAndSuspend(company.id);

          const afterSuspended = await prisma.company.findUnique({
            where: { id: company.id },
            select: { isSuspended: true },
          });

          checkedCount++;

          // Verifica se foi suspensa nesta iteração
          if (!beforeSuspended?.isSuspended && afterSuspended?.isSuspended) {
            suspendedCount++;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          this.logger.error({
            message: 'Error monitoring company',
            companyId: company.id,
            companyName: company.name,
            error: errorMessage,
          });

          // Continua com próxima empresa
        }
      }

      this.logger.log({
        message: 'Completed hourly reputation monitoring',
        checkedCount,
        suspendedCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Failed to run reputation monitoring cron',
        error: errorMessage,
      });
    }
  }

  /**
   * Obtém métricas atualizadas para uma empresa (API endpoint)
   * TASK-030: Get current metrics for a company
   */
  async getCompanyMetrics(companyId: string): Promise<ReputationMetrics> {
    return this.calculateRates(companyId);
  }
}
