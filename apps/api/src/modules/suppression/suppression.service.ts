import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
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
 * Gerencia listas de supressao (hard bounces, complaints, etc)
 * Semana 5-6: Sistema de Supressao Avancado
 */
@Injectable()
export class SuppressionService {
  private readonly logger = new Logger(SuppressionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Adicionar email a lista de supressao
   */
  async addToSuppression(data: AddSuppressionDto): Promise<void> {
    if (!this.isValidEmail(data.email)) {
      throw new BadRequestException('Invalid email format');
    }

    const domain = data.email.split('@')[1];

    this.logger.log(
      `Adicionando ${data.email} a lista de supressao com motivo: ${data.reason}`,
    );

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

      this.logger.log(
        `Email ${data.email} adicionado a lista de supressao com sucesso`,
      );
    } catch (error) {
      this.logger.error(`Erro ao adicionar ${data.email} a supressao:`, error);
      throw new BadRequestException('Failed to add email to suppression list');
    }
  }

  /**
   * Remover email da lista de supressao
   */
  async removeFromSuppression(
    suppressionId: string,
    companyId: string,
  ): Promise<void> {
    this.logger.log(`Removendo supressao: ${suppressionId}`);

    let deletedCount = 0;

    try {
      const result = await this.prisma.suppression.deleteMany({
        where: {
          id: suppressionId,
          companyId,
        },
      });

      deletedCount = result.count;
    } catch (error) {
      this.logger.error(`Erro ao remover supressao ${suppressionId}:`, error);
      throw new BadRequestException('Failed to remove suppression entry');
    }

    if (deletedCount === 0) {
      throw new NotFoundException(
        'Suppression entry not found for this company',
      );
    }

    this.logger.log(`Supressao ${suppressionId} removida da lista`);
  }

  /**
   * Verificar se email esta na lista de supressao
   */
  async checkSuppression(
    companyId: string,
    email: string,
  ): Promise<{
    suppressed: boolean;
    reason?: string;
    entry?: SuppressionEntry;
  }> {
    try {
      // Verificar supressao especifica da empresa
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

      // Verificar supressao global
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

      // Verificar contas de funcao/role
      if (this.isRoleAccount(email)) {
        return {
          suppressed: true,
          reason: 'ROLE_ACCOUNT',
        };
      }

      return { suppressed: false };
    } catch (error) {
      this.logger.error(`Erro ao verificar supressao para ${email}:`, error);
      return { suppressed: false };
    }
  }

  /**
   * Listar supressoes com paginacao
   */
  async listSuppressions(
    companyId: string,
    options: {
      page: number;
      limit: number;
      reason?: SuppressionReason;
      search?: string;
    },
  ): Promise<SuppressionListResult> {
    const { page, limit, reason, search } = options;
    const skip = (page - 1) * limit;

    const where: any = {
      AND: [
        {
          OR: [
            { companyId },
            { companyId: null }, // Supressoes globais
          ],
        },
      ],
    };

    if (reason) {
      where.reason = reason;
    }

    if (search) {
      where.AND.push({
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { domain: { contains: search, mode: 'insensitive' } },
        ],
      });
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
        suppressions: suppressions.map((s) => ({
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
      this.logger.error('Erro ao listar supressoes:', error);
      throw new BadRequestException('Failed to retrieve suppression list');
    }
  }

  /**
   * Importar lista de supressao via CSV
   */
  async importSuppressions(
    companyId: string,
    data: ImportSuppressionDto,
  ): Promise<SuppressionImportResult> {
    this.logger.log('Iniciando importacao de lista de supressao');

    const emails = data.emails.filter((email) => email.trim());
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
          // Verificar se ja existe
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

    this.logger.log(
      `Importacao de supressao concluida: ${imported} importados, ${duplicates} duplicados, ${errors.length} erros`,
    );

    return {
      imported,
      duplicates,
      errors,
    };
  }

  /**
   * Limpar supressoes expiradas
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

      this.logger.log(`${result.count} supressoes expiradas removidas`);
      return result.count;
    } catch (error) {
      this.logger.error('Erro ao limpar supressoes expiradas:', error);
      return 0;
    }
  }

  /**
   * Obter estatisticas de supressao
   */
  async getSuppressionStats(companyId: string): Promise<{
    total: number;
    byReason: Record<SuppressionReason, number>;
    recent: number; // Ultimos 30 dias
  }> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [total, byReason, recent] = await Promise.all([
        this.prisma.suppression.count({
          where: {
            OR: [{ companyId }, { companyId: null }],
          },
        }),
        this.prisma.suppression.groupBy({
          by: ['reason'],
          where: {
            OR: [{ companyId }, { companyId: null }],
          },
          _count: true,
        }),
        this.prisma.suppression.count({
          where: {
            OR: [{ companyId }, { companyId: null }],
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
      this.logger.error('Erro ao obter estatisticas de supressao:', error);
      return {
        total: 0,
        byReason: {} as any,
        recent: 0,
      };
    }
  }

  /**
   * Verificar se e uma conta de funcao/role
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
      'root',
      'hostmaster',
      'mail',
      'mailer',
      'bounce',
      'unsubscribe',
      'subscribe',
      'news',
      'newsletter',
    ];

    const localPart = email.split('@')[0].toLowerCase();
    return roleAccounts.includes(localPart);
  }

  /**
   * Validacao basica de email
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }
}
