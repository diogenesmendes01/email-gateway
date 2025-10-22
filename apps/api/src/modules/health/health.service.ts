import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, GetSendQuotaCommand } from '@aws-sdk/client-ses';
import { prisma } from '@email-gateway/database';
import { Redis } from 'ioredis';

export interface HealthCheck {
  status: 'ok' | 'error';
  message?: string;
  responseTime?: number;
  details?: any;
}

export interface ReadinessChecks {
  database: HealthCheck;
  redis: HealthCheck;
  ses: HealthCheck;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly sesClient: SESClient;
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    // Initialize SES client
    this.sesClient = new SESClient({
      region: this.configService.get<string>('AWS_SES_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY')!,
      },
    });

    // Initialize Redis client
    const redisUrl = this.configService.get<string>('REDIS_URL')!;
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
  }

  /**
   * Executa todas as verificações de readiness em paralelo
   * Otimização: executa DB, Redis e SES checks simultaneamente para reduzir tempo de resposta
   */
  async performReadinessChecks(): Promise<ReadinessChecks> {
    const [database, redis, ses] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkSESQuota(),
    ]);

    return {
      database: database.status === 'fulfilled' ? database.value : {
        status: 'error',
        message: database.reason?.message || 'Database check failed',
      },
      redis: redis.status === 'fulfilled' ? redis.value : {
        status: 'error',
        message: redis.reason?.message || 'Redis check failed',
      },
      ses: ses.status === 'fulfilled' ? ses.value : {
        status: 'error',
        message: ses.reason?.message || 'SES check failed',
      },
    };
  }

  /**
   * Verifica conectividade com o banco de dados
   */
  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Teste simples de conectividade
      await prisma.$queryRaw`SELECT 1`;
      
      const responseTime = Date.now() - startTime;
      
      this.logger.debug({
        message: 'Database health check passed',
        responseTime,
      });

      return {
        status: 'ok',
        message: 'Database connection successful',
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error({
        message: 'Database health check failed',
        error: (error as Error).message,
        responseTime,
      });

      return {
        status: 'error',
        message: `Database connection failed: ${(error as Error).message}`,
        responseTime,
      };
    }
  }

  /**
   * Verifica conectividade com o Redis
   */
  private async checkRedis(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Teste de ping
      const pong = await this.redis.ping();
      
      if (pong !== 'PONG') {
        throw new Error('Redis ping did not return PONG');
      }

      // Verifica informações básicas da fila
      const queueInfo = await this.redis.info('memory');
      
      const responseTime = Date.now() - startTime;
      
      this.logger.debug({
        message: 'Redis health check passed',
        responseTime,
      });

      return {
        status: 'ok',
        message: 'Redis connection successful',
        responseTime,
        details: {
          memoryInfo: queueInfo ? 'available' : 'unavailable',
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error({
        message: 'Redis health check failed',
        error: (error as Error).message,
        responseTime,
      });

      return {
        status: 'error',
        message: `Redis connection failed: ${(error as Error).message}`,
        responseTime,
      };
    }
  }

  /**
   * Verifica quota do SES e conectividade
   */
  private async checkSESQuota(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const command = new GetSendQuotaCommand({});
      const response = await this.sesClient.send(command);
      
      const { Max24HourSend, MaxSendRate, SentLast24Hours } = response;
      
      // Calcula percentual de uso
      const usagePercent = ((SentLast24Hours || 0) / (Max24HourSend || 1)) * 100;
      
      // Verifica se está próximo do limite (80% é considerado crítico)
      const quotaThreshold = this.configService.get<number>('SES_QUOTA_THRESHOLD', 80);
      const isQuotaHealthy = usagePercent < quotaThreshold;
      
      const responseTime = Date.now() - startTime;
      
      if (!isQuotaHealthy) {
        this.logger.warn({
          message: 'SES quota approaching limit',
          usagePercent: Math.round(usagePercent * 100) / 100,
          threshold: quotaThreshold,
          sentLast24Hours: SentLast24Hours,
          max24HourSend: Max24HourSend,
        });
      }

      this.logger.debug({
        message: 'SES health check completed',
        usagePercent: Math.round(usagePercent * 100) / 100,
        responseTime,
      });

      return {
        status: isQuotaHealthy ? 'ok' : 'error',
        message: isQuotaHealthy 
          ? 'SES quota is healthy' 
          : `SES quota usage is ${Math.round(usagePercent * 100) / 100}% (threshold: ${quotaThreshold}%)`,
        responseTime,
        details: {
          usagePercent: Math.round(usagePercent * 100) / 100,
          sentLast24Hours: SentLast24Hours,
          max24HourSend: Max24HourSend,
          maxSendRate: MaxSendRate,
          threshold: quotaThreshold,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      this.logger.error({
        message: 'SES health check failed',
        error: (error as Error).message,
        responseTime,
      });

      return {
        status: 'error',
        message: `SES check failed: ${(error as Error).message}`,
        responseTime,
      };
    }
  }

  /**
   * Cleanup resources
   */
  async onModuleDestroy() {
    try {
      await this.redis.disconnect();
      this.logger.log('Redis connection closed');
    } catch (error) {
      this.logger.error('Error closing Redis connection', error);
    }
  }
}
