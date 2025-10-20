import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService, RateLimitConfig } from './auth.service';
import { RedisService } from './redis.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly defaultConfig: RateLimitConfig = {
    rps: 60,        // 60 requests per second
    burst: 120,     // burst de 120 requests
    windowMs: 1000, // janela de 1 segundo
  };

  constructor(
    private authService: AuthService,
    private redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const companyId = (request as any)['companyId'];

    if (!companyId) {
      return true; // Se não há companyId, deixa passar (será bloqueado pelo AuthGuard)
    }

    try {
      // Obtém configuração de rate limit para a empresa
      const config = this.authService.getRateLimitConfig(companyId);
      const now = Math.floor(Date.now() / 1000); // Unix timestamp em segundos
      const windowKey = Math.floor(now / Math.ceil(config.windowMs / 1000)); // Chave da janela de tempo

      // Chaves Redis para rate limiting
      const rpsKey = `rate_limit:rps:${companyId}:${windowKey}`;
      const burstKey = `rate_limit:burst:${companyId}:${windowKey}`;

      // Verifica burst limit primeiro (mais restritivo)
      const burstCount = await this.redisService.incr(burstKey);
      if (burstCount === 1) {
        // Primeira requisição nesta janela, define TTL
        await this.redisService.expire(burstKey, Math.ceil(config.windowMs / 1000));
      }

      if (burstCount > config.burst) {
        const ttl = await this.redisService.ttl(burstKey);
        throw new HttpException(
          {
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Burst rate limit exceeded. Try again later.',
              requestId: request.headers['x-request-id'] || 'unknown',
              timestamp: new Date().toISOString(),
              retryAfter: ttl,
              details: [
                {
                  field: 'company_id',
                  message: `Burst limit: ${config.burst} requests/second, Current: ${burstCount}`,
                },
              ],
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Verifica RPS limit
      const rpsCount = await this.redisService.incr(rpsKey);
      if (rpsCount === 1) {
        // Primeira requisição nesta janela, define TTL
        await this.redisService.expire(rpsKey, Math.ceil(config.windowMs / 1000));
      }

      if (rpsCount > config.rps) {
        const ttl = await this.redisService.ttl(rpsKey);
        throw new HttpException(
          {
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Rate limit exceeded. Try again later.',
              requestId: request.headers['x-request-id'] || 'unknown',
              timestamp: new Date().toISOString(),
              retryAfter: ttl,
              details: [
                {
                  field: 'company_id',
                  message: `Limit: ${config.rps} requests/second, Current: ${rpsCount}`,
                },
              ],
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Adiciona headers de rate limit na resposta
      const response = context.switchToHttp().getResponse();
      const resetTime = (windowKey + 1) * Math.ceil(config.windowMs / 1000);
      
      response.setHeader('X-RateLimit-Limit', config.rps.toString());
      response.setHeader('X-RateLimit-Remaining', Math.max(0, config.rps - rpsCount).toString());
      response.setHeader('X-RateLimit-Reset', resetTime.toString());
      response.setHeader('X-RateLimit-Burst-Limit', config.burst.toString());
      response.setHeader('X-RateLimit-Burst-Remaining', Math.max(0, config.burst - burstCount).toString());

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Em caso de erro no Redis, permite a requisição (fail-open)
      console.error('Redis rate limiting error:', error);
      return true;
    }
  }

  /**
   * Obtém estatísticas de rate limit para uma empresa
   */
  async getRateLimitStats(companyId: string): Promise<{
    current: number;
    limit: number;
    remaining: number;
    resetTime: number;
    burstCurrent: number;
    burstLimit: number;
    burstRemaining: number;
  } | null> {
    try {
      const config = this.authService.getRateLimitConfig(companyId);
      const now = Math.floor(Date.now() / 1000);
      const windowKey = Math.floor(now / Math.ceil(config.windowMs / 1000));

      const rpsKey = `rate_limit:rps:${companyId}:${windowKey}`;
      const burstKey = `rate_limit:burst:${companyId}:${windowKey}`;

      const rpsCount = parseInt(await this.redisService.get(rpsKey) || '0');
      const burstCount = parseInt(await this.redisService.get(burstKey) || '0');

      return {
        current: rpsCount,
        limit: config.rps,
        remaining: Math.max(0, config.rps - rpsCount),
        resetTime: (windowKey + 1) * Math.ceil(config.windowMs / 1000),
        burstCurrent: burstCount,
        burstLimit: config.burst,
        burstRemaining: Math.max(0, config.burst - burstCount),
      };
    } catch (error) {
      console.error('Error getting rate limit stats:', error);
      return null;
    }
  }
}
