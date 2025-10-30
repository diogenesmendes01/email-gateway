import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface WarmupSchedule {
  startDate: Date;
  startVolume: number;
  maxDailyVolume: number;
  dailyIncrease: number; // Multiplicador (ex: 1.5 = 50% de aumento)
  maxDays: number;
}

/**
 * Warmup Scheduler Service - TRACK 2
 * Semana 11: Warm-up Scheduler
 * Calcula limite diário de envios para domínios em fase de warm-up
 */
@Injectable()
export class WarmupSchedulerService {
  private readonly logger = new Logger(WarmupSchedulerService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Obter limite diário para um domínio com warm-up ativo
   */
  async getDailyLimit(domainId: string): Promise<number | null> {
    try {
      const domain = await this.prisma.domain.findUnique({
        where: { id: domainId },
      });

      if (!domain || !domain.warmupEnabled) {
        return null;
      }

      const config = domain.warmupConfig as unknown as WarmupSchedule;
      
      if (!config || !domain.warmupStartDate) {
        return null;
      }

      // Calcular dias desde o início do warm-up
      const daysSinceStart = this.daysSince(new Date(domain.warmupStartDate));

      // Calcular limite baseado no horário atual
      return this.calculateWarmupLimit(daysSinceStart, config);
    } catch (error) {
      this.logger.error(`Failed to get daily limit: ${error.message}`);
      return null;
    }
  }

  /**
   * Obter limite horário (para rate limiting em tempo real)
   */
  async getHourlyLimit(domainId: string): Promise<number | null> {
    try {
      const dailyLimit = await this.getDailyLimit(domainId);
      
      if (!dailyLimit) {
        return null;
      }

      // Distribuir limite diário uniformemente por 24 horas
      // Mas aplicar fator de segurança para picos
      return Math.ceil(dailyLimit / 24 * 1.2); // 20% de margem
    } catch (error) {
      this.logger.error(`Failed to get hourly limit: ${error.message}`);
      return null;
    }
  }

  /**
   * Calcular limite de warm-up para um dia específico
   */
  private calculateWarmupLimit(daysSinceStart: number, schedule: WarmupSchedule): number {
    // Se já passou do máximo de dias, usar volume máximo
    if (daysSinceStart >= schedule.maxDays) {
      return schedule.maxDailyVolume;
    }

    // Crescimento exponencial: volume = startVolume * (dailyIncrease ^ dias)
    const limit = Math.floor(
      schedule.startVolume * Math.pow(schedule.dailyIncrease, daysSinceStart)
    );

    // Não ultrapassar o máximo
    return Math.min(limit, schedule.maxDailyVolume);
  }

  /**
   * Iniciar warm-up para um domínio
   */
  async startWarmup(
    domainId: string,
    config?: Partial<WarmupSchedule>
  ): Promise<void> {
    try {
      // Configuração padrão
      const defaultConfig: WarmupSchedule = {
        startDate: new Date(),
        startVolume: 50,
        maxDailyVolume: 100000,
        dailyIncrease: 1.5, // 50% de aumento por dia
        maxDays: 30,
        ...config,
      };

      await this.prisma.domain.update({
        where: { id: domainId },
        data: {
          warmupEnabled: true,
          warmupStartDate: defaultConfig.startDate,
          warmupConfig: defaultConfig,
        },
      });

      this.logger.log(
        `Warm-up started for domain ${domainId}: ${defaultConfig.startVolume} → ${defaultConfig.maxDailyVolume} over ${defaultConfig.maxDays} days`
      );
    } catch (error) {
      this.logger.error(`Failed to start warmup: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pausar warm-up para um domínio
   */
  async pauseWarmup(domainId: string): Promise<void> {
    try {
      await this.prisma.domain.update({
        where: { id: domainId },
        data: {
          warmupEnabled: false,
        },
      });

      this.logger.log(`Warm-up paused for domain ${domainId}`);
    } catch (error) {
      this.logger.error(`Failed to pause warmup: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resumir warm-up para um domínio (reiniciar contagem)
   */
  async resumeWarmup(domainId: string): Promise<void> {
    try {
      await this.prisma.domain.update({
        where: { id: domainId },
        data: {
          warmupEnabled: true,
          warmupStartDate: new Date(),
        },
      });

      this.logger.log(`Warm-up resumed for domain ${domainId}`);
    } catch (error) {
      this.logger.error(`Failed to resume warmup: ${error.message}`);
      throw error;
    }
  }

  /**
   * Completar warm-up para um domínio (passar para produção)
   */
  async completeWarmup(domainId: string): Promise<void> {
    try {
      await this.prisma.domain.update({
        where: { id: domainId },
        data: {
          warmupEnabled: false,
          isProductionReady: true,
        },
      });

      this.logger.log(`Warm-up completed for domain ${domainId}`);
    } catch (error) {
      this.logger.error(`Failed to complete warmup: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obter status de warm-up para um domínio
   */
  async getWarmupStatus(domainId: string): Promise<{
    active: boolean;
    daysSinceStart: number;
    currentLimit: number;
    maxLimit: number;
    progressPercentage: number;
    estimatedCompletionDate: Date;
  } | null> {
    try {
      const domain = await this.prisma.domain.findUnique({
        where: { id: domainId },
      });

      if (!domain || !domain.warmupEnabled || !domain.warmupStartDate) {
        return null;
      }

      const config = domain.warmupConfig as unknown as WarmupSchedule;
      const daysSinceStart = this.daysSince(new Date(domain.warmupStartDate));
      const currentLimit = this.calculateWarmupLimit(daysSinceStart, config);
      const progressPercentage = (daysSinceStart / config.maxDays) * 100;

      // Calcular data estimada de conclusão
      const estimatedCompletion = new Date(domain.warmupStartDate);
      estimatedCompletion.setDate(
        estimatedCompletion.getDate() + config.maxDays
      );

      return {
        active: true,
        daysSinceStart,
        currentLimit,
        maxLimit: config.maxDailyVolume,
        progressPercentage: Math.min(100, progressPercentage),
        estimatedCompletionDate: estimatedCompletion,
      };
    } catch (error) {
      this.logger.error(`Failed to get warmup status: ${error.message}`);
      return null;
    }
  }

  /**
   * Listar todos os domínios em warm-up
   */
  async listActiveWarmups(): Promise<Array<{
    domainId: string;
    domain: string;
    daysSinceStart: number;
    currentLimit: number;
    maxLimit: number;
  }>> {
    try {
      const domains = await this.prisma.domain.findMany({
        where: { warmupEnabled: true },
        select: {
          id: true,
          domain: true,
          warmupStartDate: true,
          warmupConfig: true,
        },
      });

      return domains.map(d => {
        const config = d.warmupConfig as unknown as WarmupSchedule;
        const daysSinceStart = this.daysSince(new Date(d.warmupStartDate!));
        const currentLimit = this.calculateWarmupLimit(daysSinceStart, config);

        return {
          domainId: d.id,
          domain: d.domain,
          daysSinceStart,
          currentLimit,
          maxLimit: config.maxDailyVolume,
        };
      });
    } catch (error) {
      this.logger.error(`Failed to list active warmups: ${error.message}`);
      return [];
    }
  }

  /**
   * Verificar e completar warm-ups que atingiram o limite máximo
   */
  async autoCompleteWarmups(): Promise<number> {
    try {
      const domains = await this.prisma.domain.findMany({
        where: { warmupEnabled: true },
        select: {
          id: true,
          warmupStartDate: true,
          warmupConfig: true,
        },
      });

      let completed = 0;

      for (const domain of domains) {
        const config = domain.warmupConfig as unknown as WarmupSchedule;
        const daysSinceStart = this.daysSince(new Date(domain.warmupStartDate!));

        // Se passou do máximo de dias, completar warm-up
        if (daysSinceStart >= config.maxDays) {
          await this.completeWarmup(domain.id);
          completed++;
        }
      }

      if (completed > 0) {
        this.logger.log(`Auto-completed ${completed} warmups`);
      }

      return completed;
    } catch (error) {
      this.logger.error(`Failed to auto-complete warmups: ${error.message}`);
      return 0;
    }
  }

  /**
   * Calcular dias desde uma data
   */
  private daysSince(date: Date): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Gerar recomendações de warm-up
   */
  async generateWarmupRecommendations(
    domainId: string
  ): Promise<string[]> {
    try {
      const status = await this.getWarmupStatus(domainId);

      if (!status) {
        return ['No active warm-up'];
      }

      const recommendations: string[] = [];

      // Se progresso < 25%
      if (status.progressPercentage < 25) {
        recommendations.push(
          'You are in the early stages of warm-up. Keep sending volumes consistent and monitor bounce/complaint rates.'
        );
      }

      // Se progresso entre 25-50%
      if (status.progressPercentage >= 25 && status.progressPercentage < 50) {
        recommendations.push(
          'You are in the middle of warm-up. Continue increasing volumes gradually and maintaining sender reputation.'
        );
      }

      // Se progresso entre 50-75%
      if (status.progressPercentage >= 50 && status.progressPercentage < 75) {
        recommendations.push(
          'You are in the advanced stage of warm-up. Start preparing for production volume ramp.'
        );
      }

      // Se progresso > 75%
      if (status.progressPercentage > 75) {
        recommendations.push(
          'You are near the end of warm-up. Prepare to reach full production volume.'
        );
      }

      return recommendations;
    } catch (error) {
      this.logger.error(`Failed to generate recommendations: ${error.message}`);
      return [];
    }
  }
}
