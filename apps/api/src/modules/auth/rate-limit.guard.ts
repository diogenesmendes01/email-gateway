import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService, RateLimitConfig } from './auth.service';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
    burstCount: number;
    burstResetTime: number;
  };
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private store: RateLimitStore = {};
  private readonly defaultConfig: RateLimitConfig = {
    rps: 60,        // 60 requests per second
    burst: 120,     // burst de 120 requests
    windowMs: 1000, // janela de 1 segundo
  };

  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const companyId = request['companyId'];

    if (!companyId) {
      return true; // Se não há companyId, deixa passar (será bloqueado pelo AuthGuard)
    }

    // Obtém configuração de rate limit para a empresa
    const config = this.authService.getRateLimitConfig(companyId);
    const key = `rate_limit:${companyId}`;
    const now = Date.now();

    // Inicializa ou limpa dados expirados
    if (!this.store[key] || this.store[key].resetTime <= now) {
      this.store[key] = {
        count: 0,
        resetTime: now + config.windowMs,
        burstCount: 0,
        burstResetTime: now + config.windowMs,
      };
    }

    const current = this.store[key];

    // Verifica burst limit (120 requests por segundo)
    if (current.burstCount >= config.burst) {
      throw new HttpException(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Burst rate limit exceeded. Try again later.',
            requestId: request.headers['x-request-id'] || 'unknown',
            timestamp: new Date().toISOString(),
            details: [
              {
                field: 'company_id',
                message: `Burst limit: ${config.burst} requests/second, Current: ${current.burstCount + 1}`,
              },
            ],
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Verifica RPS limit (60 requests por segundo)
    if (current.count >= config.rps) {
      const retryAfter = Math.ceil((current.resetTime - now) / 1000);
      
      throw new HttpException(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Rate limit exceeded. Try again later.',
            requestId: request.headers['x-request-id'] || 'unknown',
            timestamp: new Date().toISOString(),
            details: [
              {
                field: 'company_id',
                message: `Limit: ${config.rps} requests/second, Current: ${current.count + 1}`,
              },
            ],
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Incrementa contadores
    current.count++;
    current.burstCount++;

    // Adiciona headers de rate limit na resposta
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-RateLimit-Limit', config.rps.toString());
    response.setHeader('X-RateLimit-Remaining', Math.max(0, config.rps - current.count).toString());
    response.setHeader('X-RateLimit-Reset', Math.ceil(current.resetTime / 1000).toString());
    response.setHeader('X-RateLimit-Burst-Limit', config.burst.toString());
    response.setHeader('X-RateLimit-Burst-Remaining', Math.max(0, config.burst - current.burstCount).toString());

    return true;
  }

  /**
   * Limpa dados expirados do store (deve ser chamado periodicamente)
   */
  cleanup(): void {
    const now = Date.now();
    for (const key in this.store) {
      const data = this.store[key];
      if (data.resetTime <= now && data.burstResetTime <= now) {
        delete this.store[key];
      }
    }
  }

  /**
   * Obtém estatísticas de rate limit para uma empresa
   */
  getRateLimitStats(companyId: string): {
    current: number;
    limit: number;
    remaining: number;
    resetTime: number;
    burstCurrent: number;
    burstLimit: number;
    burstRemaining: number;
  } | null {
    const key = `rate_limit:${companyId}`;
    const data = this.store[key];
    
    if (!data) {
      return null;
    }

    const config = this.authService.getRateLimitConfig(companyId);
    const now = Date.now();

    return {
      current: data.count,
      limit: config.rps,
      remaining: Math.max(0, config.rps - data.count),
      resetTime: data.resetTime,
      burstCurrent: data.burstCount,
      burstLimit: config.burst,
      burstRemaining: Math.max(0, config.burst - data.burstCount),
    };
  }
}
