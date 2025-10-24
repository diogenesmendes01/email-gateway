import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, GetSendQuotaCommand } from '@aws-sdk/client-ses';
import { prisma } from '@email-gateway/database';
import { Redis } from 'ioredis';

export interface HealthCheck {
  status: 'ok' | 'warning' | 'error';
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

  // TASK-008: SES quota monitoring configuration
  private quotaCache: { data: HealthCheck; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 60000; // 1 minuto
  private readonly QUOTA_WARNING_THRESHOLD = 0.8; // 80%
  private readonly QUOTA_CRITICAL_THRESHOLD = 0.95; // 95%
  private readonly SES_TIMEOUT_MS = 2000; // 2 segundos

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
   * TASK-008: Enhanced with cache, timeout, and graduated thresholds (warning + critical)
   */
  private async checkSESQuota(): Promise<HealthCheck> {
    // Use cache if available and valid
    if (this.quotaCache && Date.now() - this.quotaCache.timestamp < this.CACHE_TTL_MS) {
      this.logger.debug('Using cached SES quota data');
      return this.quotaCache.data;
    }

    const startTime = Date.now();

    try {
      const command = new GetSendQuotaCommand({});

      // Add timeout to prevent health check from hanging
      const response = await Promise.race([
        this.sesClient.send(command),
        this.timeoutPromise(this.SES_TIMEOUT_MS),
      ]);

      const sentLast24Hours = response.SentLast24Hours || 0;
      const max24HourSend = response.Max24HourSend || 200; // Default sandbox limit
      const maxSendRate = response.MaxSendRate || 1;

      // Calculate usage percentage
      const usagePercent = max24HourSend > 0
        ? (sentLast24Hours / max24HourSend) * 100
        : 0;

      const responseTime = Date.now() - startTime;

      // Determine status based on graduated thresholds
      let status: 'ok' | 'warning' | 'error' = 'ok';
      let message: string;

      if (usagePercent >= this.QUOTA_CRITICAL_THRESHOLD * 100) {
        status = 'error';
        message = `SES quota critical: ${usagePercent.toFixed(1)}% used (${sentLast24Hours}/${max24HourSend} emails)`;

        this.logger.error({
          message: 'SES quota critical',
          usagePercent: usagePercent.toFixed(2),
          sentLast24Hours,
          max24HourSend,
          threshold: this.QUOTA_CRITICAL_THRESHOLD * 100,
        });
      } else if (usagePercent >= this.QUOTA_WARNING_THRESHOLD * 100) {
        status = 'warning';
        message = `SES quota warning: ${usagePercent.toFixed(1)}% used (${sentLast24Hours}/${max24HourSend} emails)`;

        this.logger.warn({
          message: 'SES quota warning',
          usagePercent: usagePercent.toFixed(2),
          sentLast24Hours,
          max24HourSend,
          threshold: this.QUOTA_WARNING_THRESHOLD * 100,
        });
      } else {
        message = `SES quota healthy: ${usagePercent.toFixed(1)}% used`;

        this.logger.debug({
          message: 'SES quota healthy',
          usagePercent: usagePercent.toFixed(2),
          sentLast24Hours,
          max24HourSend,
        });
      }

      const result: HealthCheck = {
        status,
        message,
        responseTime,
        details: {
          usagePercent: parseFloat(usagePercent.toFixed(2)),
          sentLast24Hours,
          max24HourSend,
          maxSendRate,
          warningThreshold: this.QUOTA_WARNING_THRESHOLD * 100,
          criticalThreshold: this.QUOTA_CRITICAL_THRESHOLD * 100,
        },
      };

      // Update cache
      this.quotaCache = {
        data: result,
        timestamp: Date.now(),
      };

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'SES health check failed',
        error: errorMessage,
        responseTime,
      });

      return {
        status: 'error',
        message: `SES check failed: ${errorMessage}`,
        responseTime,
      };
    }
  }

  /**
   * Creates a timeout promise that rejects after specified milliseconds
   */
  private timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`SES quota check timeout after ${ms}ms`)), ms)
    );
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
