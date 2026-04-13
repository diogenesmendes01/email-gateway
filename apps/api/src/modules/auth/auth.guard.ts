import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService, ApiKeyPayload } from './auth.service';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private metricsService: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Extrai API Key do header
    const apiKey = this.extractApiKey(request);
    if (!apiKey) {
      throw new UnauthorizedException('API Key is required');
    }

    // Valida API Key
    const payload = await this.authService.validateApiKey(apiKey);
    if (!payload) {
      throw new UnauthorizedException('Invalid API Key');
    }

    // Verifica se a empresa está ativa
    if (!payload.isActive) {
      throw new ForbiddenException('Company is inactive');
    }

    // TASK-038: Verifica se a empresa está suspensa
    if (payload.isSuspended) {
      // Record metric for suspended tenant access
      this.metricsService.recordTenantSuspended(payload.companyId, payload.suspensionReason ?? undefined);

      throw new ForbiddenException({
        code: 'COMPANY_SUSPENDED',
        message: 'Company is suspended',
        suspensionReason: payload.suspensionReason,
      });
    }

    // TASK-038: Verifica se a empresa está aprovada
    if (!payload.isApproved) {
      // Record metric for unapproved tenant access
      this.metricsService.recordTenantUnapproved(payload.companyId);

      throw new ForbiddenException({
        code: 'COMPANY_PENDING_APPROVAL',
        message: 'Company pending approval',
      });
    }

    // Verifica se a API Key expirou
    if (this.authService.isApiKeyExpired(payload.expiresAt)) {
      throw new UnauthorizedException('API Key has expired');
    }

    // Verifica IP allowlist
    const clientIp = this.getClientIp(request);
    const isIpAllowed = await this.authService.validateIpAllowlist(
      payload.companyId,
      clientIp,
    );
    
    if (!isIpAllowed) {
      throw new ForbiddenException('IP address not allowed');
    }

    // Atualiza lastUsedAt
    await this.authService.updateLastUsedAt(payload.companyId);

    // Adiciona informações da empresa ao request
    (request as any)['company'] = payload;
    (request as any)['companyId'] = payload.companyId;

    return true;
  }

  private extractApiKey(request: Request): string | null {
    const apiKey = request.headers['x-api-key'] as string;
    return apiKey || null;
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    const realIp = request.headers['x-real-ip'];
    const remoteAddress = this.normalizeIp(
      request.socket?.remoteAddress || request.connection?.remoteAddress,
    );

    // Forwarded headers are only trustworthy when the immediate peer is a trusted proxy.
    if (remoteAddress && this.isTrustedProxy(remoteAddress)) {
      if (realIp) {
        const candidate = this.normalizeIp(Array.isArray(realIp) ? realIp[0] : realIp);
        if (candidate) {
          return candidate;
        }
      }

      if (forwarded) {
        const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
        const candidate = this.normalizeIp(forwardedValue.split(',')[0].trim());
        if (candidate) {
          return candidate;
        }
      }
    }

    return remoteAddress || 'unknown';
  }

  private normalizeIp(ip?: string | null): string | null {
    if (!ip) {
      return null;
    }

    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }

    return ip;
  }

  private isTrustedProxy(remoteAddress: string): boolean {
    const configuredTrustedProxies = (process.env.TRUSTED_PROXY_IPS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (configuredTrustedProxies.length > 0) {
      return configuredTrustedProxies.includes(remoteAddress);
    }

    return this.isPrivateOrLoopbackIp(remoteAddress);
  }

  private isPrivateOrLoopbackIp(ip: string): boolean {
    if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') {
      return true;
    }

    if (ip.startsWith('10.') || ip.startsWith('192.168.')) {
      return true;
    }

    if (ip.startsWith('172.')) {
      const secondOctet = Number.parseInt(ip.split('.')[1] || '', 10);
      return secondOctet >= 16 && secondOctet <= 31;
    }

    return ip.startsWith('fc') || ip.startsWith('fd');
  }
}

/**
 * Decorator para obter informações da empresa do request
 */
export const Company = () => {
  return (target: any, propertyKey: string, parameterIndex: number) => {
    // Este decorator será usado para injetar informações da empresa
    // nos controllers
  };
};
