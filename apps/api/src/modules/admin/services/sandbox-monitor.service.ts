/**
 * @email-gateway/api - Sandbox Monitor Service
 *
 * Service para monitorar empresas em sandbox e auto-aprovar
 *
 * TASK-034: Auto-aprovação de empresas
 * Aprova automaticamente após 7 dias + boas métricas
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { prisma } from '@email-gateway/database';

/**
 * Service de monitoramento de sandbox mode
 * Auto-aprovação baseada em métricas de qualidade
 */
@Injectable()
export class SandboxMonitorService {
  private readonly logger = new Logger(SandboxMonitorService.name);

  // Critérios de auto-aprovação
  private readonly MIN_DAYS = 7;
  private readonly MIN_EMAILS_SENT = 50;
  private readonly MAX_BOUNCE_RATE = 2.0; // 2%
  private readonly MAX_COMPLAINT_RATE = 0.05; // 0.05%
  private readonly APPROVED_DAILY_LIMIT = 5000;

  /**
   * Cron job diário: verifica empresas elegíveis para auto-aprovação
   * TASK-034: Daily check for auto-approval
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkAutoApproval(): Promise<void> {
    this.logger.log({
      message: 'Starting daily auto-approval check',
      timestamp: new Date().toISOString(),
    });

    try {
      const sevenDaysAgo = new Date(Date.now() - this.MIN_DAYS * 24 * 60 * 60 * 1000);

      // Busca empresas candidatas
      const candidates = await prisma.company.findMany({
        where: {
          isApproved: false,
          isActive: true,
          isSuspended: false,
          createdAt: { lte: sevenDaysAgo },
          bounceRate: { lt: this.MAX_BOUNCE_RATE },
          complaintRate: { lt: this.MAX_COMPLAINT_RATE },
        },
        select: {
          id: true,
          name: true,
          createdAt: true,
          bounceRate: true,
          complaintRate: true,
          _count: {
            select: {
              emailOutbox: {
                where: { status: 'SENT' },
              },
            },
          },
        },
      });

      this.logger.log({
        message: 'Found candidate companies for auto-approval',
        count: candidates.length,
      });

      let approvedCount = 0;

      for (const company of candidates) {
        const emailsSent = company._count.emailOutbox;

        // Verifica se enviou emails suficientes
        if (emailsSent >= this.MIN_EMAILS_SENT) {
          try {
            await this.autoApproveCompany(company.id, company.name, {
              emailsSent,
              bounceRate: company.bounceRate,
              complaintRate: company.complaintRate,
              daysInSandbox: Math.floor(
                (Date.now() - company.createdAt.getTime()) / (24 * 60 * 60 * 1000)
              ),
            });

            approvedCount++;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            this.logger.error({
              message: 'Failed to auto-approve company',
              companyId: company.id,
              companyName: company.name,
              error: errorMessage,
            });
          }
        } else {
          this.logger.debug({
            message: 'Company not eligible: insufficient emails',
            companyId: company.id,
            companyName: company.name,
            emailsSent,
            required: this.MIN_EMAILS_SENT,
          });
        }
      }

      this.logger.log({
        message: 'Completed daily auto-approval check',
        candidatesChecked: candidates.length,
        approved: approvedCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Failed to run auto-approval check',
        error: errorMessage,
      });
    }
  }

  /**
   * Aprova automaticamente uma empresa
   * TASK-034: Auto-approve company
   */
  private async autoApproveCompany(
    companyId: string,
    companyName: string,
    metrics: {
      emailsSent: number;
      bounceRate: number;
      complaintRate: number;
      daysInSandbox: number;
    }
  ): Promise<void> {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        isApproved: true,
        approvedAt: new Date(),
        approvedBy: 'AUTO_APPROVAL_SYSTEM',
        dailyEmailLimit: this.APPROVED_DAILY_LIMIT,
      },
    });

    this.logger.log({
      message: 'Company auto-approved',
      companyId,
      companyName,
      metrics: {
        daysInSandbox: metrics.daysInSandbox,
        emailsSent: metrics.emailsSent,
        bounceRate: metrics.bounceRate.toFixed(2),
        complaintRate: metrics.complaintRate.toFixed(4),
      },
      newDailyLimit: this.APPROVED_DAILY_LIMIT,
    });
  }

  /**
   * Obtém estatísticas do sandbox
   * Útil para monitoring e admin dashboard
   */
  async getSandboxStats(): Promise<{
    pending: number;
    approved: number;
    rejected: number;
    avgDaysToApproval: number;
  }> {
    try {
      const [pending, approved, rejected] = await Promise.all([
        prisma.company.count({
          where: {
            isApproved: false,
            isActive: true,
            isSuspended: false,
          },
        }),
        prisma.company.count({
          where: { isApproved: true },
        }),
        prisma.company.count({
          where: {
            isApproved: false,
            isActive: false,
          },
        }),
      ]);

      // Calcula média de dias até aprovação
      const approvedCompanies = await prisma.company.findMany({
        where: {
          isApproved: true,
          approvedAt: { not: null },
        },
        select: {
          createdAt: true,
          approvedAt: true,
        },
      });

      const avgDaysToApproval = approvedCompanies.length > 0
        ? approvedCompanies.reduce((sum, company) => {
            const days = Math.floor(
              (company.approvedAt!.getTime() - company.createdAt!.getTime()) / (24 * 60 * 60 * 1000)
            );
            return sum + days;
          }, 0) / approvedCompanies.length
        : 0;

      return {
        pending,
        approved,
        rejected,
        avgDaysToApproval: Math.round(avgDaysToApproval * 10) / 10,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Failed to get sandbox stats',
        error: errorMessage,
      });

      return {
        pending: 0,
        approved: 0,
        rejected: 0,
        avgDaysToApproval: 0,
      };
    }
  }
}
