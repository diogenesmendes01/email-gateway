import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    // Initialize Redis client
    const redisUrl = this.configService.get<string>('REDIS_URL')!;
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
  }

  /**
   * Executa todas as verificações de readiness em paralelo
   */
  async performReadinessChecks(): Promise<ReadinessChecks> {
    const [database, redis] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
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
