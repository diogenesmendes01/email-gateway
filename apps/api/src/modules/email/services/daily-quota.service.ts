/**
 * @email-gateway/api - Daily Quota Service
 *
 * Service para controle de limite diário de envios por empresa
 *
 * TASK-029: Daily Quota Service
 * Implementa controle de quota usando Redis para prevenir abuso
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@email-gateway/database';
import Redis from 'ioredis';

/**
 * Resultado da verificação de quota
 */
export interface QuotaResult {
  allowed: boolean;
  current: number;
  limit: number;
  resetsAt: string;
  reason?: string;
}

/**
 * Service de gerenciamento de quota diária
 */
@Injectable()
export class DailyQuotaService {
  private readonly logger = new Logger(DailyQuotaService.name);
  private redis: Redis;

  constructor(private configService: ConfigService) {
    // Inicializa Redis
    const redisUrl = this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.redis = new Redis(redisUrl);

    this.logger.log({
      message: 'DailyQuotaService initialized',
      redisUrl: redisUrl.replace(/:[^:]*@/, ':***@'), // Mask password
    });
  }

  /**
   * Verifica se a empresa tem quota disponível
   * TASK-029: Check quota before sending
   */
  async checkQuota(companyId: string): Promise<QuotaResult> {
    try {
      // Busca configuração da empresa
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          dailyEmailLimit: true,
          isSuspended: true,
        },
      });

      if (!company) {
        return {
          allowed: false,
          current: 0,
          limit: 0,
          resetsAt: this.getNextReset(),
          reason: 'Company not found',
        };
      }

      // Verifica se empresa está suspensa
      if (company.isSuspended) {
        this.logger.warn({
          message: 'Company is suspended',
          companyId,
        });

        return {
          allowed: false,
          current: 0,
          limit: company.dailyEmailLimit,
          resetsAt: this.getNextReset(),
          reason: 'Company suspended',
        };
      }

      // Busca uso atual
      const today = this.getDateKey();
      const key = `quota:company:${companyId}:${today}`;
      const current = await this.redis.get(key);
      const currentCount = current ? parseInt(current, 10) : 0;

      const allowed = currentCount < company.dailyEmailLimit;

      this.logger.debug({
        message: 'Quota checked',
        companyId,
        current: currentCount,
        limit: company.dailyEmailLimit,
        allowed,
      });

      return {
        allowed,
        current: currentCount,
        limit: company.dailyEmailLimit,
        resetsAt: this.getNextReset(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Failed to check quota',
        companyId,
        error: errorMessage,
      });

      // Fail-safe: permite envio se Redis falhar
      return {
        allowed: true,
        current: 0,
        limit: 1000,
        resetsAt: this.getNextReset(),
        reason: 'Quota check failed, allowing send',
      };
    }
  }

  /**
   * Incrementa o contador de quota
   * TASK-029: Increment counter after enqueue
   */
  async incrementQuota(companyId: string, count = 1): Promise<void> {
    try {
      const today = this.getDateKey();
      const key = `quota:company:${companyId}:${today}`;

      // Incrementa e define TTL de 24h
      await this.redis
        .multi()
        .incrby(key, count)
        .expire(key, 86400) // 24 horas
        .exec();

      this.logger.debug({
        message: 'Quota incremented',
        companyId,
        count,
        key,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Failed to increment quota',
        companyId,
        count,
        error: errorMessage,
      });

      // Não falha o envio se não conseguir incrementar
      // O contador será inconsistente, mas é melhor que perder emails
    }
  }

  /**
   * Obtém informações de quota para uma empresa
   * TASK-029: Endpoint to query quota usage
   */
  async getQuotaInfo(companyId: string): Promise<QuotaResult> {
    return this.checkQuota(companyId);
  }

  /**
   * Reseta o contador de quota para uma empresa (admin only)
   * Útil para casos de emergência ou ajustes manuais
   */
  async resetQuota(companyId: string): Promise<void> {
    try {
      const today = this.getDateKey();
      const key = `quota:company:${companyId}:${today}`;

      await this.redis.del(key);

      this.logger.log({
        message: 'Quota reset manually',
        companyId,
        key,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Failed to reset quota',
        companyId,
        error: errorMessage,
      });

      throw new Error(`Failed to reset quota: ${errorMessage}`);
    }
  }

  /**
   * Obtém a chave de data no formato YYYY-MM-DD (UTC)
   * TASK-029: Date key for Redis
   */
  private getDateKey(): string {
    const now = new Date();
    return now.toISOString().split('T')[0]; // "2025-10-28"
  }

  /**
   * Calcula quando a quota reseta (meia-noite UTC do próximo dia)
   * TASK-029: Reset timestamp
   */
  private getNextReset(): string {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    return tomorrow.toISOString();
  }

  /**
   * Cleanup: fecha conexão Redis
   */
  async onModuleDestroy() {
    await this.redis.quit();
  }
}
