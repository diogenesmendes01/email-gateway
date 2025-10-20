import { Controller, Get, HttpStatus, HttpException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { QueueService } from '../queue/queue.service';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly queueService: QueueService,
    private readonly healthService: HealthService,
  ) {}

  /**
   * Healthcheck leve - apenas verifica se a aplicação está rodando
   * Usado por load balancers e monitors básicos
   */
  @Get('healthz')
  @Throttle(60, 60) // 60 requests per minute
  async getHealthz() {
    try {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || 'unknown',
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Readiness check - verifica dependências críticas (DB, Redis, SES quota)
   * Usado para determinar se a aplicação está pronta para receber tráfego
   */
  @Get('readyz')
  @Throttle(30, 60) // 30 requests per minute (mais restritivo)
  async getReadyz() {
    try {
      const checks = await this.healthService.performReadinessChecks();
      
      const allHealthy = Object.values(checks).every(check => check.status === 'ok');
      
      if (!allHealthy) {
        throw new HttpException(
          {
            status: 'not_ready',
            checks,
            timestamp: new Date().toISOString(),
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      return {
        status: 'ready',
        checks,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'not_ready',
          error: error.message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Healthcheck detalhado - mantido para compatibilidade
   * @deprecated Use /healthz para healthcheck básico e /readyz para readiness
   */
  @Get()
  async getHealth() {
    const queue = await this.queueService.getQueueHealth();
    return {
      status: 'ok',
      queue: {
        waiting: queue.waiting,
        active: queue.active,
        failed: queue.failed,
        delayed: queue.delayed,
        total: queue.total,
      },
    };
  }
}


