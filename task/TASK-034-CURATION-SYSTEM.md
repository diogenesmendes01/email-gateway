# TASK-034 — Sistema de Curadoria de Clientes (Feature - Priority 2)

## Contexto
- Origem: MULTI_TENANT_PLAN.md - Sprint 5
- Resumo: Implementar aprovação manual/automática de novos clientes. Sandbox mode (100 emails/dia) até aprovação. Auto-aprovação após 7 dias + boa reputação.

## O que precisa ser feito
- [ ] Criar AdminController com endpoints de aprovação
- [ ] POST /v1/admin/companies/:id/approve
- [ ] POST /v1/admin/companies/:id/reject
- [ ] POST /v1/admin/companies/:id/suspend
- [ ] POST /v1/admin/companies/:id/reactivate
- [ ] GET /v1/admin/companies/pending
- [ ] Criar SandboxMonitorService (cron diário)
- [ ] Auto-aprovar se: 7+ dias, 50+ emails, bounce < 2%, complaint < 0.05%
- [ ] Aumentar dailyEmailLimit após aprovação (1000 → 5000)
- [ ] AdminGuard (autenticação admin)
- [ ] Testes unitários

## Urgência
- **Nível (1–5):** 4 (ALTO - Qualidade + Segurança)

## Responsável sugerido
- Backend (API + Cron)

## Dependências / Riscos
- Dependências:
  - TASK-026 (Company.isApproved, approvedAt)
  - TASK-030 (métricas de reputação)
- Riscos:
  - BAIXO: Critérios de auto-aprovação muito rígidos/frouxos

## Detalhes Técnicos

Ver MULTI_TENANT_PLAN.md seção "3.1 API de Aprovação" e "3.2 Sandbox Mode".

### AdminController

```typescript
@Controller('v1/admin/companies')
@UseGuards(AdminGuard)
export class AdminController {
  @Get('pending')
  async listPending() {
    return prisma.company.findMany({
      where: { isApproved: false, isActive: true },
      select: {
        id: true,
        name: true,
        createdAt: true,
        bounceRate: true,
        complaintRate: true,
        _count: { select: { emailOutbox: true } },
      },
    });
  }

  @Post(':id/approve')
  async approve(@Param('id') companyId: string, @Body() dto: ApproveDto) {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        isApproved: true,
        approvedAt: new Date(),
        approvedBy: dto.adminUsername,
        dailyEmailLimit: 5000, // Aumentar limite
      },
    });

    // TODO: Enviar email de boas-vindas
    return { success: true };
  }

  @Post(':id/reject')
  async reject(@Param('id') companyId: string, @Body() dto: RejectDto) {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        isActive: false,
        suspensionReason: dto.reason,
      },
    });

    return { success: true };
  }
}
```

### SandboxMonitorService (Auto-aprovação)

```typescript
@Injectable()
export class SandboxMonitorService {
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkAutoApproval() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const companies = await prisma.company.findMany({
      where: {
        isApproved: false,
        isActive: true,
        isSuspended: false,
        createdAt: { lte: sevenDaysAgo },
        bounceRate: { lt: 2 },
        complaintRate: { lt: 0.05 },
      },
      include: {
        _count: { select: { emailOutbox: { where: { status: 'SENT' } } } },
      },
    });

    for (const company of companies) {
      if (company._count.emailOutbox >= 50) {
        await prisma.company.update({
          where: { id: company.id },
          data: {
            isApproved: true,
            approvedAt: new Date(),
            approvedBy: 'AUTO_APPROVAL_SYSTEM',
            dailyEmailLimit: 5000,
          },
        });

        console.log(`Company ${company.id} auto-approved`);
      }
    }
  }
}
```

### AdminGuard (Autenticação)

```typescript
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Verificar header X-Admin-Token
    const adminToken = request.headers['x-admin-token'];

    if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
      throw new UnauthorizedException('Admin access required');
    }

    return true;
  }
}
```

## Categoria
**Feature - Curation + Security**

## Bloqueador para Produção?
**SIM - CRÍTICO**

Sem curadoria:
- ❌ Qualquer um pode criar conta e enviar
- ❌ Alto risco de abuso
- ❌ Sem controle de qualidade

Com curadoria:
- ✅ Sandbox inicial (100 emails/dia)
- ✅ Aprovação manual ou automática
- ✅ Controle de qualidade

## Checklist

- [ ] AdminController implementado
- [ ] SandboxMonitorService implementado
- [ ] AdminGuard criado
- [ ] Cron job testado
- [ ] Testes unitários
- [ ] PR revisado

## Próximos Passos

- **TASK-035:** Admin Dashboard UI
