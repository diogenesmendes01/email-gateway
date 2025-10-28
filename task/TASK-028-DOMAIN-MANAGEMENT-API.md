# TASK-028 — API de Gerenciamento de Domínios (Feature - Priority 1)

## Contexto
- Origem: MULTI_TENANT_PLAN.md - Sprint 1
- Dependências: TASK-026 (schema), TASK-027 (worker)
- Resumo: Criar endpoints REST para empresas gerenciarem seus domínios: adicionar, listar, verificar status, ver tokens DNS, definir como padrão.

## O que precisa ser feito
- [ ] Criar módulo `domain` na API
- [ ] POST /v1/company/domains - Adicionar domínio
- [ ] GET /v1/company/domains - Listar domínios
- [ ] GET /v1/company/domains/:id - Detalhes do domínio
- [ ] GET /v1/company/domains/:id/dns - Ver tokens DNS
- [ ] POST /v1/company/domains/:id/verify - Forçar verificação
- [ ] PATCH /v1/company/domains/:id/default - Definir como padrão
- [ ] DELETE /v1/company/domains/:id - Remover domínio
- [ ] Integrar com DomainManagementService existente
- [ ] Adicionar DTOs de validação
- [ ] Testes unitários e E2E

## Urgência
- **Nível (1–5):** 5 (CRÍTICO - Habilita multi-tenant)

## Responsável sugerido
- Backend (API)

## Dependências / Riscos
- Dependências:
  - TASK-026, TASK-027 concluídas
  - DomainManagementService (já existe)
- Riscos:
  - MÉDIO: Chamadas AWS SES API podem falhar
  - BAIXO: DNS queries podem demorar

## Detalhes Técnicos

Ver MULTI_TENANT_PLAN.md seção "1.3 API - Gerenciamento de Domínios" para código completo.

### Estrutura

```
apps/api/src/modules/domain/
├── domain.module.ts
├── domain.controller.ts
├── domain.service.ts
└── dto/
    ├── create-domain.dto.ts
    ├── update-domain.dto.ts
    └── domain-response.dto.ts
```

### Endpoints Principais

- `POST /v1/company/domains` - Adicionar e iniciar verificação no AWS SES
- `GET /v1/company/domains` - Listar todos os domínios da empresa
- `GET /v1/company/domains/:id/dns` - Retornar tokens DKIM, SPF, DMARC
- `POST /v1/company/domains/:id/verify` - Forçar verificação consultando AWS
- `PATCH /v1/company/domains/:id/default` - Definir como domínio padrão (atualizar Company.domainId)
- `DELETE /v1/company/domains/:id` - Remover domínio

### Validações

- Domain format (RFC 1035)
- Não permitir domínios duplicados
- Não permitir remover domínio se for o padrão
- Validar que domínio pertence à empresa

## Categoria
**Feature - API + Multi-tenant**

## Bloqueador para Produção?
**SIM - CRÍTICO**

Sem esta API:
- ❌ Clientes não conseguem adicionar domínios próprios
- ❌ Sem forma de ver tokens DNS
- ❌ Sem forma de verificar status

Com esta API:
- ✅ Self-service para adicionar domínios
- ✅ Ver tokens DNS para configurar
- ✅ Verificar status em tempo real

## Checklist

- [ ] Módulo domain criado
- [ ] Todos endpoints implementados
- [ ] DTOs com validação
- [ ] Integração com DomainManagementService
- [ ] Testes unitários
- [ ] Testes E2E
- [ ] Swagger/OpenAPI documentado
- [ ] PR criado e revisado

## Próximos Passos

- **TASK-029:** Daily Quota Service
