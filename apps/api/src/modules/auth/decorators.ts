import { UseGuards, applyDecorators } from '@nestjs/common';
import { ApiKeyGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { BasicAuthGuard } from './basic-auth.guard';
import { AuditInterceptor } from './audit.interceptor';
import { UseInterceptors } from '@nestjs/common';

/**
 * Decorator para proteger rotas com API Key + Rate Limit + Auditoria
 * Usado para endpoints da API pública
 */
export function ApiProtected() {
  return applyDecorators(
    UseGuards(ApiKeyGuard, RateLimitGuard),
    UseInterceptors(AuditInterceptor),
  );
}

/**
 * Decorator para proteger rotas com Basic Auth + Auditoria
 * Usado para endpoints do dashboard/admin
 */
export function DashboardProtected() {
  return applyDecorators(
    UseGuards(BasicAuthGuard),
    UseInterceptors(AuditInterceptor),
  );
}

/**
 * Decorator para proteger rotas com API Key + Auditoria (sem rate limit)
 * Usado para endpoints que precisam de autenticação mas não de rate limiting
 */
export function ApiKeyOnly() {
  return applyDecorators(
    UseGuards(ApiKeyGuard),
    UseInterceptors(AuditInterceptor),
  );
}

/**
 * Decorator para aplicar apenas auditoria
 * Usado para endpoints que não precisam de autenticação mas precisam de auditoria
 */
export function Audited() {
  return applyDecorators(
    UseInterceptors(AuditInterceptor),
  );
}
