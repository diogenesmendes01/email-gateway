import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService, ApiKeyPayload } from './auth.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private authService: AuthService) {}

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
    const remoteAddress = request.connection.remoteAddress;
    
    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
    }
    
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }
    
    return remoteAddress || 'unknown';
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
