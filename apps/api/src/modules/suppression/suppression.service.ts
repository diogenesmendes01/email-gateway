import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { SuppressionReason } from '@email-gateway/database';

export interface SuppressionEntry {
  id: string;
  companyId: string | null;
  email: string;
  domain: string | null;
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

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Adicionar email à lista de supressão
   */
  async addToSuppression(data: AddSuppressionDto): Promise<void> {
    if (!this.isValidEmail(data.email)) {
      throw new BadRequestException('Invalid email format');
    }

    const domain = data.email.split('@')[1];

    this.logger.log(`Adicionando ${data.email} à lista de supressão com motivo: ${data.reason}`);

    try {
      await this.prisma.suppression.upsert({
        where: {
          companyId_email: {
            companyId: data.companyId ?? '',
            email: data.email,
          },
        },
        create: {
          companyId: data.companyId,
          email: data.email,
          domain,
          reason: data.reason,
          source: data.source || 'manual',
          bounceType: data.bounceType,
          diagnosticCode: data.diagnosticCode,
          expiresAt: data.expiresAt,
        },
        update: {
          reason: data.reason,
          source: data.source || 'manual',
          bounceType: data.bounceType,
          diagnosticCode: data.diagnosticCode,
          suppressedAt: new Date(),
          expiresAt: data.expiresAt,
        },
      });

      this.logger.log(`Email ${data.email} adicionado à lista de supressão com sucesso`);
    } catch (error) {
      this.logger.error(`Erro ao adicionar ${data.email} à supressão:`, error);
      throw new BadRequestException('Failed to add email to suppression list');
    }
  }

  /**
   * Remover email da lista de supressão
   */
  async removeFromSuppression(suppressionId: string): Promise<void> {
    this.logger.log(`Removendo supressão: ${suppressionId}`);

    try {
      const result = await this.prisma.suppression.delete({
        where: { id: suppressionId },
      });

      this.logger.log(`Email ${result.email} removido da lista de supressão`);
    } catch (error) {
      this.logger.error(`Erro ao remover supressão ${suppressionId}:`, error);
      throw new BadRequestException('Suppression entry not found');
    }
  }

  /**
   * Verificar se email está na lista de supressão
   */
  async checkSuppression(companyId: string, email: string): Promise<{
    suppressed: boolean;
    reason?: string;
    entry?: SuppressionEntry;
  }> {
    try {
      // Verificar supressão específica da empresa
      let suppression = await this.prisma.suppression.findUnique({
        where: {
          companyId_email: { companyId, email },
        },
      });

      if (suppression) {
        return {
          suppressed: true,
          reason: suppression.reason,
          entry: {
            id: suppression.id,
            companyId: suppression.companyId,
            email: suppression.email,
            domain: suppression.domain,
            reason: suppression.reason,
            source: suppression.source || 'unknown',
            suppressedAt: suppression.suppressedAt,
            expiresAt: suppression.expiresAt || undefined,
          },
        };
      }

      // Verificar supressão global
      suppression = await this.prisma.suppression.findFirst({
        where: {
          companyId: null,
          email,
        },
      });

      if (suppression) {
        return {
          suppressed: true,
          reason: suppression.reason,
          entry: {
            id: suppression.id,
            companyId: suppression.companyId,
            email: suppression.email,
            domain: suppression.domain,
            reason: suppression.reason,
            source: suppression.source || 'unknown',
            suppressedAt: suppression.suppressedAt,
            expiresAt: suppression.expiresAt || undefined,
          },
        };
      }

      // Verificar contas de função/role
      if (this.isRoleAccount(email)) {
        return {
          suppressed: true,
          reason: 'ROLE_ACCOUNT',
        };
      }

      return { suppressed: false };
    } catch (error) {
      this.logger.error(`Erro ao verificar supressão para ${email}:`, error);
      return { suppressed: false };
    }
  }

  /**
   * Listar supressões com paginação
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
        { companyId: null }, // Supressões globais
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

    try {
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
    } catch (error) {
      this.logger.error('Erro ao listar supressões:', error);
      throw new BadRequestException('Failed to retrieve suppression list');
    }
  }

  /**
   * Importar lista de supressão via CSV
   */
  async importSuppressions(
    companyId: string,
    data: ImportSuppressionDto
  ): Promise<SuppressionImportResult> {
    this.logger.log('Iniciando importação de lista de supressão');

    const emails = data.emails.filter(email => email.trim());
    let imported = 0;
    let duplicates = 0;
    const errors: string[] = [];

    // Processar em lotes para evitar sobrecarga
    const batchSize = 100;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);

      for (const email of batch) {
        const trimmedEmail = email.trim().toLowerCase();

        if (!this.isValidEmail(trimmedEmail)) {
          errors.push(`Invalid email format: ${email}`);
          continue;
        }

        try {
          // Verificar se já existe
          const existing = await this.checkSuppression(companyId, trimmedEmail);
          if (existing.suppressed) {
            duplicates++;
            continue;
          }

          await this.addToSuppression({
            companyId,
            email: trimmedEmail,
            reason: data.reason,
            source: data.source || 'import',
          });

          imported++;
        } catch (error) {
          errors.push(`Failed to import ${email}: ${(error as Error).message}`);
        }
      }
    }

    this.logger.log(`Importação de supressão concluída: ${imported} importados, ${duplicates} duplicados, ${errors.length} erros`);

    return {
      imported,
      duplicates,
      errors,
    };
  }

  /**
   * Limpar supressões expiradas
   */
  async cleanExpiredSuppressions(): Promise<number> {
    try {
      const now = new Date();

      const result = await this.prisma.suppression.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      });

      this.logger.log(`${result.count} supressões expiradas removidas`);
      return result.count;
    } catch (error) {
      this.logger.error('Erro ao limpar supressões expiradas:', error);
      return 0;
    }
  }

  /**
   * Obter estatísticas de supressão
   */
  async getSuppressionStats(companyId: string): Promise<{
    total: number;
    byReason: Record<SuppressionReason, number>;
    recent: number; // Últimos 30 dias
  }> {
    try {
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
      byReason.forEach((item: any) => {
        reasonStats[item.reason as SuppressionReason] = item._count;
      });

      return {
        total,
        byReason: reasonStats,
        recent,
      };
    } catch (error) {
      this.logger.error('Erro ao obter estatísticas de supressão:', error);
      return {
        total: 0,
        byReason: {} as any,
        recent: 0,
      };
    }
  }

  /**
   * Verificar se é uma conta de função/role
   */
  private isRoleAccount(email: string): boolean {
    const roleAccounts = [
      'admin', 'info', 'postmaster', 'abuse', 'noreply',
      'support', 'help', 'contact', 'sales', 'webmaster',
      'root', 'hostmaster', 'mail', 'mailer', 'bounce',
      'unsubscribe', 'subscribe', 'news', 'newsletter',
    ];

    const localPart = email.split('@')[0].toLowerCase();
    return roleAccounts.includes(localPart);
  }

  /**
   * Validação básica de email
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }
}