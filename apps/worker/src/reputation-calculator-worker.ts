import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ReputationMonitorService } from './services/reputation-monitor.service';
import { PrismaService } from '@packages/database';

/**
 * Reputation Calculator Worker - TRACK 2
 * Semana 7-8: Reputação & Guardrails
 * Cron job que roda a cada 1 hora para calcular métricas e aplicar guardrails
 */
export class ReputationCalculatorWorker {
  private readonly logger = new Logger(ReputationCalculatorWorker.name);

  constructor(
    private readonly reputationMonitor: ReputationMonitorService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Processar cálculo de reputação para todas as empresas
   */
  async process(job?: Job): Promise<{
    processed: number;
    violations: number;
    cleanedSuppressions: number;
  }> {
    try {
      this.logger.log('Starting reputation calculation for all companies');

      let processed = 0;
      let violations = 0;

      // 1. Obter todas as empresas ativas
      const companies = await this.prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });

      this.logger.log(`Found ${companies.length} active companies`);

      // 2. Processar cada empresa
      for (const company of companies) {
        try {
          // 2.1 Verificar e aplicar guardrails
          const enforcement = await this.reputationMonitor.checkAndEnforce(company.id);

          // 2.2 Salvar métrica diária
          await this.reputationMonitor.saveReputationMetric(company.id);

          processed++;

          if (enforcement.actions.length > 0) {
            violations++;
            this.logger.warn(
              `Company ${company.name}: ${enforcement.actions.join(', ')}`
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to process company ${company.id}: ${error.message}`
          );
        }
      }

      // 3. Limpar supressões expiradas
      const cleanedSuppressions =
        await this.reputationMonitor.cleanupExpiredSuppressions();

      this.logger.log(
        `Reputation calculation completed: ${processed} processed, ${violations} violations, ${cleanedSuppressions} suppressions cleaned`
      );

      return {
        processed,
        violations,
        cleanedSuppressions,
      };
    } catch (error) {
      this.logger.error(`Failed to process reputation calculation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Executar verificação sob demanda para uma empresa
   */
  async processForCompany(companyId: string): Promise<any> {
    try {
      this.logger.log(`Processing reputation for company ${companyId}`);

      const enforcement = await this.reputationMonitor.checkAndEnforce(companyId);
      await this.reputationMonitor.saveReputationMetric(companyId);

      return enforcement;
    } catch (error) {
      this.logger.error(`Failed to process company ${companyId}: ${error.message}`);
      throw error;
    }
  }
}
