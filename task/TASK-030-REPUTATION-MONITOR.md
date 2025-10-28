# TASK-030 — Reputation Monitor Service (Feature - Priority 2)

## Contexto
- Origem: MULTI_TENANT_PLAN.md - Sprint 2 (Proteções)
- Resumo: Monitorar bounce rate e complaint rate por empresa. Suspender automaticamente se métricas ruins (kill switch). Proteger reputação da conta AWS.

## O que precisa ser feito
- [ ] Criar ReputationMonitorService
- [ ] Método calculateRates(companyId): calcular bounce/complaint rate (últimos 7 dias)
- [ ] Método checkAndSuspend(companyId): suspender se bounce > 5% ou complaint > 0.1%
- [ ] Cron job (@hourly): monitorar todas empresas ativas
- [ ] Atualizar Company.bounceRate e complaintRate (cache)
- [ ] Enviar alertas (log, Slack opcional)
- [ ] Testes unitários
- [ ] Testes E2E

## Urgência
- **Nível (1–5):** 5 (CRÍTICO - Proteção de reputação)

## Responsável sugerido
- Backend (API + Cron)

## Dependências / Riscos
- Dependências:
  - TASK-026 (Company.bounceRate, complaintRate, isSuspended)
  - EmailLog com bounce/complaint data (TASK-024)
  - @nestjs/schedule
- Riscos:
  - MÉDIO: Queries pesadas em tabelas grandes
  - BAIXO: Falso positivo → revisar thresholds

## Detalhes Técnicos

Ver MULTI_TENANT_PLAN.md seção "2.2 Reputation Monitor Service".

### Thresholds

- **Bounce rate:** > 5% → suspensão (AWS suspende em > 10%)
- **Complaint rate:** > 0.1% → suspensão (AWS suspende em > 0.5%)

### Implementação

```typescript
@Injectable()
export class ReputationMonitorService {
  async calculateRates(companyId: string) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const totalSent = await prisma.emailLog.count({
      where: { companyId, status: 'SENT', sentAt: { gte: sevenDaysAgo } },
    });

    const totalBounces = await prisma.emailLog.count({
      where: { companyId, bounceType: 'Permanent', createdAt: { gte: sevenDaysAgo } },
    });

    const totalComplaints = await prisma.emailLog.count({
      where: { companyId, complaintFeedbackType: { not: null }, createdAt: { gte: sevenDaysAgo } },
    });

    const bounceRate = totalSent > 0 ? (totalBounces / totalSent) * 100 : 0;
    const complaintRate = totalSent > 0 ? (totalComplaints / totalSent) * 100 : 0;

    return { bounceRate, complaintRate, totalSent, totalBounces, totalComplaints };
  }

  async checkAndSuspend(companyId: string) {
    const rates = await this.calculateRates(companyId);

    // Atualizar cache
    await prisma.company.update({
      where: { id: companyId },
      data: {
        bounceRate: rates.bounceRate,
        complaintRate: rates.complaintRate,
        lastMetricsUpdate: new Date(),
      },
    });

    // Verificar thresholds
    if (rates.bounceRate > 5) {
      await this.suspendCompany(companyId, `High bounce rate: ${rates.bounceRate.toFixed(2)}%`);
    }

    if (rates.complaintRate > 0.1) {
      await this.suspendCompany(companyId, `High complaint rate: ${rates.complaintRate.toFixed(2)}%`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async monitorAllCompanies() {
    const companies = await prisma.company.findMany({
      where: { isActive: true, isSuspended: false },
    });

    for (const company of companies) {
      await this.checkAndSuspend(company.id);
    }
  }
}
```

## Categoria
**Feature - Protection + Monitoring**

## Bloqueador para Produção?
**SIM - CRÍTICO**

Sem monitor:
- ❌ Cliente problemático afeta todos
- ❌ Risco de suspensão AWS
- ❌ Sem visibilidade de métricas

Com monitor:
- ✅ Kill switch automático
- ✅ Proteção da conta AWS
- ✅ Métricas em tempo real

## Checklist

- [ ] ReputationMonitorService implementado
- [ ] Cron job ativo
- [ ] Testes unitários
- [ ] Testes E2E
- [ ] Alertas configurados
- [ ] PR revisado

## Próximos Passos

- **TASK-031:** Content Validation Service
