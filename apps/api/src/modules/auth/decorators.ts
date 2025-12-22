import { UseGuards, applyDecorators, createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { ApiKeyGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { BasicAuthGuard } from './basic-auth.guard';
import { AdminGuard } from './admin.guard';
import { AuditInterceptor } from './audit.interceptor';
import { UseInterceptors } from '@nestjs/common';

/**
 * Decorator para proteger rotas com API Key + Rate Limit + Auditoria + Multi-Tenant
 *
 * TASK-038: Inclui validações multi-tenant (isApproved, isSuspended, quota)
 *
 * Usado para endpoints da API pública que precisam de:
 * - Autenticação via API Key
 * - Rate limiting
 * - Auditoria de todas as operações
 * - Validações multi-tenant (empresa aprovada, não suspensa, quota disponível)
 *
 * @returns Decorator que aplica ApiKeyGuard, RateLimitGuard e AuditInterceptor
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
 * Decorator para proteger rotas com Basic Auth + Auditoria (apenas admin)
 * Usado para endpoints do dashboard que requerem permissões de admin
 */
export function AdminProtected() {
  return applyDecorators(
    UseGuards(BasicAuthGuard, AdminGuard),
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

/**
 * Decorator para rotas que permitem acesso limitado a empresas em sandbox/não aprovadas
 *
 * TASK-038: Permite configuração inicial de domínios mesmo sem aprovação completa
 *
 * Usado para endpoints essenciais de configuração que empresas em sandbox
 * precisam acessar para completar a configuração inicial.
 *
 * @returns Decorator que aplica ApiKeyGuard (sem verificar aprovação) + RateLimit + Audit
 */
export function SandboxAllowed() {
  return applyDecorators(
    UseGuards(ApiKeyGuard), // Permite acesso mesmo sem aprovação
    UseGuards(RateLimitGuard),
    UseInterceptors(AuditInterceptor),
  );
}

/**
 * Decorator para extrair companyId do request (injetado pelo ApiKeyGuard)
 *
 * TASK-038: Padrão obrigatório para isolamento multi-tenant
 *
 * Extrai o companyId do request que foi injetado pelo ApiKeyGuard após
 * validação da API Key. Deve ser usado em todos os endpoints que precisam
 * identificar o tenant para isolamento de dados.
 *
 * Uso correto:
 * ```typescript
 * @Get()
 * async getData(@Company() companyId: string) {
 *   // companyId garantidamente válido e isolado
 *   return this.service.getData(companyId);
 * }
 * ```
 *
 * Nunca use `req.companyId` diretamente - sempre use este decorator
 * para garantir consistência e isolamento multi-tenant.
 *
 * @param data - Não usado (reservado para extensões futuras)
 * @param ctx - Contexto de execução do NestJS
 * @returns companyId string validado e isolado
 */
export const Company = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.companyId;
  },
);
