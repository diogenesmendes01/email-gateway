<<<<<<< HEAD
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SuppressionReason } from '@certshift/database';

export interface SuppressionEntry {
  id: string;
  companyId: string | null;
  email: string;
  domain: string;
  reason: SuppressionReason;
  source: string;
  suppressedAt: Date;
  expiresAt?: Date;
}

export interface SuppressionListResult {
  suppressions: SuppressionEntry[];
  total: number;
}

export interface SuppressionImportResult {
  imported: number;
  duplicates: number;
  errors: string[];
}

=======
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
>>>>>>> chore-read-esp-plan-nxRpa
@Injectable()
export class SuppressionService {
  private readonly logger = new Logger(SuppressionService.name);

<<<<<<< HEAD
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Add email to suppression list
   */
  async addToSuppression(data: {
    companyId?: string;
    email: string;
    reason: SuppressionReason;
    source?: string;
    expiresAt?: Date;
  }): Promise<void> {
    const domain = data.email.split('@')[1];

    this.logger.log(`Adding ${data.email} to suppression list with reason: ${data.reason}`);

    await this.prisma.suppression.upsert({
      where: {
        companyId_email: {
          companyId: data.companyId || null,
          email: data.email,
        },
      },
      create: {
        companyId: data.companyId,
        email: data.email,
        domain,
        reason: data.reason,
        source: data.source || 'manual',
        expiresAt: data.expiresAt,
      },
      update: {
        reason: data.reason,
        source: data.source || 'manual',
        suppressedAt: new Date(),
        expiresAt: data.expiresAt,
      },
    });

    this.logger.log(`Successfully added ${data.email} to suppression list`);
  }

  /**
   * Remove email from suppression list
   */
  async removeFromSuppression(suppressionId: string): Promise<void> {
    this.logger.log(`Removing suppression entry: ${suppressionId}`);

    const result = await this.prisma.suppression.delete({
      where: { id: suppressionId },
    });

    this.logger.log(`Successfully removed ${result.email} from suppression list`);
  }

  /**
   * Check if email is suppressed
   */
  async checkSuppression(companyId: string, email: string): Promise<{
    suppressed: boolean;
    reason?: string;
  }> {
    // Check company-specific suppression
    const companySuppression = await this.prisma.suppression.findUnique({
      where: {
        companyId_email: { companyId, email },
      },
    });

    if (companySuppression) {
      return {
        suppressed: true,
        reason: companySuppression.reason,
      };
    }

    // Check global suppression
    const globalSuppression = await this.prisma.suppression.findFirst({
      where: {
        companyId: null,
        email,
      },
    });

    if (globalSuppression) {
      return {
        suppressed: true,
        reason: globalSuppression.reason,
      };
    }

    // Check role accounts
    if (this.isRoleAccount(email)) {
      return {
        suppressed: true,
        reason: 'ROLE_ACCOUNT',
      };
    }

    return { suppressed: false };
  }

  /**
   * List suppression entries with pagination
   */
  async listSuppressions(
    companyId: string,
    options: {
      page: number;
      limit: number;
      reason?: SuppressionReason;
      search?: string;
    }
  ): Promise<SuppressionListResult> {
    const { page, limit, reason, search } = options;
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [
        { companyId },
        { companyId: null }, // Global suppressions
      ],
    };

    if (reason) {
      where.reason = reason;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { domain: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [suppressions, total] = await Promise.all([
      this.prisma.suppression.findMany({
        where,
        orderBy: { suppressedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.suppression.count({ where }),
    ]);

    return {
      suppressions: suppressions.map(s => ({
        id: s.id,
        companyId: s.companyId,
        email: s.email,
        domain: s.domain,
        reason: s.reason,
        source: s.source || 'unknown',
        suppressedAt: s.suppressedAt,
        expiresAt: s.expiresAt || undefined,
      })),
      total,
    };
  }

  /**
   * Import suppression list from CSV
   */
  async importSuppressions(
    companyId: string,
    data: {
      csvData: string;
      reason: SuppressionReason;
      source?: string;
    }
  ): Promise<SuppressionImportResult> {
    this.logger.log('Starting suppression list import');

    const lines = data.csvData.split('\n').filter(line => line.trim());
    const emails: string[] = [];

    // Parse CSV (simple format: email per line, or email,reason format)
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Simple CSV parsing - split by comma and take first column as email
      const columns = trimmed.split(',');
      const email = columns[0].trim().toLowerCase();

      if (this.isValidEmail(email)) {
        emails.push(email);
      }
    }

    let imported = 0;
    let duplicates = 0;
    const errors: string[] = [];

    // Process in batches to avoid overwhelming the database
    const batchSize = 100;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);

      for (const email of batch) {
        try {
          // Check if already exists
          const existing = await this.checkSuppression(companyId, email);
          if (existing.suppressed) {
            duplicates++;
=======
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
>>>>>>> chore-read-esp-plan-nxRpa
            continue;
          }

          await this.addToSuppression({
<<<<<<< HEAD
            companyId,
            email,
            reason: data.reason,
            source: data.source || 'import',
          });

          imported++;
        } catch (error) {
          errors.push(`Failed to import ${email}: ${error.message}`);
        }
      }
    }

    this.logger.log(`Suppression import completed: ${imported} imported, ${duplicates} duplicates, ${errors.length} errors`);

    return {
      imported,
      duplicates,
      errors,
    };
  }

  /**
   * Clean expired suppressions
   */
  async cleanExpiredSuppressions(): Promise<number> {
    const now = new Date();

    const result = await this.prisma.suppression.deleteMany({
      where: {
        expiresAt: {
          lt: now,
        },
      },
    });

    this.logger.log(`Cleaned ${result.count} expired suppressions`);
    return result.count;
  }

  /**
   * Get suppression statistics
   */
  async getSuppressionStats(companyId: string): Promise<{
    total: number;
    byReason: Record<SuppressionReason, number>;
    recent: number; // Last 30 days
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [total, byReason, recent] = await Promise.all([
      this.prisma.suppression.count({
        where: {
          OR: [
            { companyId },
            { companyId: null },
          ],
        },
      }),
      this.prisma.suppression.groupBy({
        by: ['reason'],
        where: {
          OR: [
            { companyId },
            { companyId: null },
          ],
        },
        _count: true,
      }),
      this.prisma.suppression.count({
        where: {
          OR: [
            { companyId },
            { companyId: null },
          ],
          suppressedAt: {
            gte: thirtyDaysAgo,
          },
        },
      }),
    ]);

    const reasonStats: Record<SuppressionReason, number> = {} as any;
    byReason.forEach(item => {
      reasonStats[item.reason] = item._count;
    });

    return {
      total,
      byReason: reasonStats,
      recent,
    };
  }

  /**
   * Check if email is a role account
   */
  private isRoleAccount(email: string): boolean {
    const roleAccounts = [
      'admin', 'info', 'postmaster', 'abuse', 'noreply',
      'support', 'help', 'contact', 'sales', 'webmaster',
      'root', 'hostmaster', 'mail', 'mailer', 'bounce',
      'unsubscribe', 'subscribe', 'news', 'newsletter',
=======
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
>>>>>>> chore-read-esp-plan-nxRpa
    ];

    const localPart = email.split('@')[0].toLowerCase();
    return roleAccounts.includes(localPart);
  }

  /**
<<<<<<< HEAD
   * Basic email validation
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
=======
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
>>>>>>> chore-read-esp-plan-nxRpa
  }
}
