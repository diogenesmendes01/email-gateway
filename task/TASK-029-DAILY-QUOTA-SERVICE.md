# TASK-029 — Daily Quota Service (Feature - Priority 2)

## Contexto
- Origem: MULTI_TENANT_PLAN.md - Sprint 2 (Proteções)
- Resumo: Implementar controle de limite diário de envios por empresa usando Redis. Prevenir que um cliente ultrapasse sua quota e afete outros.

## O que precisa ser feito
- [ ] Criar DailyQuotaService
- [ ] Método checkQuota(companyId): verificar se tem quota disponível
- [ ] Método incrementQuota(companyId, count): incrementar contador
- [ ] Usar Redis para contadores (key: `quota:company:{id}:{date}`, TTL: 24h)
- [ ] Integrar no EmailSendService ANTES de enfileirar
- [ ] Retornar erro 429 quando quota excedida
- [ ] Endpoint GET /v1/company/quota para consultar uso
- [ ] Testes unitários
- [ ] Testes E2E

## Urgência
- **Nível (1–5):** 5 (CRÍTICO - Proteção essencial)

## Responsável sugerido
- Backend (API + Redis)

## Dependências / Riscos
- Dependências:
  - TASK-026 (Company.dailyEmailLimit)
  - Redis rodando
- Riscos:
  - BAIXO: Redis down → fallback ou fail-safe
  - BAIXO: Race condition em alto volume

## Detalhes Técnicos

Ver MULTI_TENANT_PLAN.md seção "2.1 Daily Quota Service" para código completo.

### Implementação

```typescript
// apps/api/src/modules/email/services/daily-quota.service.ts
@Injectable()
export class DailyQuotaService {
  private redis: Redis;

  async checkQuota(companyId: string): Promise<QuotaResult> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { dailyEmailLimit: true, isSuspended: true },
    });

    if (company.isSuspended) {
      return { allowed: false, reason: 'Company suspended' };
    }

    const today = this.getDateKey(); // 2025-01-20
    const key = `quota:company:${companyId}:${today}`;
    const current = await this.redis.get(key);
    const currentCount = current ? parseInt(current) : 0;

    return {
      allowed: currentCount < company.dailyEmailLimit,
      current: currentCount,
      limit: company.dailyEmailLimit,
      resetsAt: this.getNextReset(), // Meia-noite UTC
    };
  }

  async incrementQuota(companyId: string, count = 1): Promise<void> {
    const today = this.getDateKey();
    const key = `quota:company:${companyId}:${today}`;

    await this.redis.multi()
      .incrby(key, count)
      .expire(key, 86400) // 24 horas
      .exec();
  }
}
```

### Integração no EmailSendService

```typescript
async sendEmail(companyId: string, dto: EmailSendDto) {
  // NOVO: Verificar quota ANTES de processar
  const quota = await this.dailyQuotaService.checkQuota(companyId);

  if (!quota.allowed) {
    throw new HttpException({
      statusCode: 429,
      code: 'DAILY_QUOTA_EXCEEDED',
      message: `Daily email limit exceeded (${quota.current}/${quota.limit})`,
      resetsAt: quota.resetsAt,
    }, HttpStatus.TOO_MANY_REQUESTS);
  }

  // ... processar email

  // NOVO: Incrementar contador após enfileirar
  await this.dailyQuotaService.incrementQuota(companyId);
}
```

## Categoria
**Feature - Protection + Performance**

## Bloqueador para Produção?
**SIM - CRÍTICO**

Sem quota:
- ❌ Cliente pode enviar ilimitadamente
- ❌ Afeta performance do sistema
- ❌ Afeta outros clientes

Com quota:
- ✅ Limite por empresa
- ✅ Proteção contra abuso
- ✅ Performance controlada

## Checklist

- [ ] DailyQuotaService implementado
- [ ] Integrado no EmailSendService
- [ ] Endpoint GET /v1/company/quota
- [ ] Testes com Redis
- [ ] Testes E2E
- [ ] PR revisado

## Próximos Passos

- **TASK-030:** Reputation Monitor Service
