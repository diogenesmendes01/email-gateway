import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@packages/database';
import { SuppressionReason } from '@packages/database';

export interface AddSuppressionDto {
  companyId?: string;
  email: string;
  reason: SuppressionReason;
  source?: string;
  bounceType?: string;
  diagnosticCode?: string;
  expiresAt?: Date;
}

export interface CheckSuppressionDto {
  email: string;
}

export interface ImportSuppressionDto {
  emails: string[];
  reason: SuppressionReason;
  source?: string;
}

/**
 * Suppression Service - TRACK 2
 * Gerencia listas de supressão (hard bounces, complaints, etc)
 * Semana 5-6: Sistema de Supressão Avançado
 */
@Injectable()
export class SuppressionService {
  private readonly logger = new Logger(SuppressionService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Adicionar email à lista de supressão
   */
  async addToSuppression(data: AddSuppressionDto): Promise<void> {
    try {
      const domain = data.email.split('@')[1];

      // Validar email
      if (!this.isValidEmail(data.email)) {
        throw new BadRequestException('Invalid email address');
      }

      await this.prisma.suppression.upsert({
        where: {
          idx_suppression_company_email: {
            companyId: data.companyId || null,
            email: data.email,
          },
        },
        create: {
          companyId: data.companyId || null,
          email: data.email,
          domain,
          reason: data.reason,
          source: data.source,
          bounceType: data.bounceType,
          diagnosticCode: data.diagnosticCode,
          expiresAt: data.expiresAt,
        },
        update: {
          reason: data.reason,
          source: data.source,
          bounceType: data.bounceType,
          diagnosticCode: data.diagnosticCode,
          suppressedAt: new Date(),
          expiresAt: data.expiresAt,
        },
      });

      this.logger.log(
        `Email ${data.email} added to suppression list (reason: ${data.reason})`
      );
    } catch (error) {
      this.logger.error(`Failed to add suppression: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verificar se email está suprimido
   */
  async checkSuppression(companyId: string, email: string): Promise<{
    suppressed: boolean;
    reason?: SuppressionReason;
    expiresAt?: Date;
  }> {
    try {
      // Verificar supressão por empresa
      const companySuppression = await this.prisma.suppression.findUnique({
        where: {
          idx_suppression_company_email: {
            companyId,
            email,
          },
        },
      });

      if (companySuppression) {
        // Verificar se expirou
        if (companySuppression.expiresAt && companySuppression.expiresAt < new Date()) {
          // Remover se expirou
          await this.removeSuppression(companySuppression.id);
          return { suppressed: false };
        }

        return {
          suppressed: true,
          reason: companySuppression.reason,
          expiresAt: companySuppression.expiresAt || undefined,
        };
      }

      // Verificar supressão global
      const globalSuppression = await this.prisma.suppression.findFirst({
        where: {
          companyId: null,
          email,
        },
      });

      if (globalSuppression) {
        // Verificar se expirou
        if (globalSuppression.expiresAt && globalSuppression.expiresAt < new Date()) {
          await this.removeSuppression(globalSuppression.id);
          return { suppressed: false };
        }

        return {
          suppressed: true,
          reason: globalSuppression.reason,
          expiresAt: globalSuppression.expiresAt || undefined,
        };
      }

      // Verificar role accounts (admin@, info@, postmaster@, etc)
      if (this.isRoleAccount(email)) {
        return {
          suppressed: true,
          reason: 'ROLE_ACCOUNT' as SuppressionReason,
        };
      }

      return { suppressed: false };
    } catch (error) {
      this.logger.error(`Failed to check suppression: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remover da lista de supressão
   */
  async removeSuppression(suppressionId: string): Promise<void> {
    try {
      await this.prisma.suppression.delete({
        where: { id: suppressionId },
      });

      this.logger.log(`Suppression ${suppressionId} removed`);
    } catch (error) {
      this.logger.error(`Failed to remove suppression: ${error.message}`);
      throw error;
    }
  }

  /**
   * Importar lista de supressões em massa
   */
  async importSuppressions(data: ImportSuppressionDto & { companyId?: string }): Promise<{
    imported: number;
    failed: number;
    errors: Array<{ email: string; error: string }>;
  }> {
    const results = {
      imported: 0,
      failed: 0,
      errors: [] as Array<{ email: string; error: string }>,
    };

    try {
      for (const email of data.emails) {
        try {
          if (!this.isValidEmail(email)) {
            results.failed++;
            results.errors.push({ email, error: 'Invalid email format' });
            continue;
          }

          await this.addToSuppression({
            companyId: data.companyId,
            email: email.toLowerCase().trim(),
            reason: data.reason,
            source: data.source,
          });

          results.imported++;
        } catch (error) {
          results.failed++;
          results.errors.push({ email, error: error.message });
        }
      }

      this.logger.log(
        `Imported ${results.imported} suppressions (${results.failed} failed)`
      );
    } catch (error) {
      this.logger.error(`Failed to import suppressions: ${error.message}`);
    }

    return results;
  }

  /**
   * Listar todas as supressões de uma empresa
   */
  async listSuppressions(
    companyId?: string,
    skip = 0,
    take = 100,
  ): Promise<{
    data: any[];
    total: number;
    skip: number;
    take: number;
  }> {
    try {
      const where = companyId ? { companyId } : { companyId: null };

      const [data, total] = await Promise.all([
        this.prisma.suppression.findMany({
          where,
          skip,
          take,
          orderBy: { suppressedAt: 'desc' },
        }),
        this.prisma.suppression.count({ where }),
      ]);

      return { data, total, skip, take };
    } catch (error) {
      this.logger.error(`Failed to list suppressions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validar email
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Verificar se é conta de role (admin@, info@, etc)
   */
  private isRoleAccount(email: string): boolean {
    const roleAccounts = [
      'admin',
      'info',
      'postmaster',
      'abuse',
      'noreply',
      'support',
      'help',
      'contact',
      'sales',
      'webmaster',
      'hostmaster',
      'mailer-daemon',
      'nobody',
      'root',
    ];

    const localPart = email.split('@')[0].toLowerCase();
    return roleAccounts.includes(localPart);
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
