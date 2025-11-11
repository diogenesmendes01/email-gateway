# TASK-038 — Hardening Multi-Tenant

## Objetivo
Garantir que nenhum cliente consiga afetar outro em cenários de envio, gerenciamento de domínios, reputação, quotas e autenticação, concluindo os itens remanescentes para operação multi-tenant isolada.

## Sumário do Plano
- [1. Quotas diárias por tenant](#1-quotas-diárias-por-tenant)
- [2. Proteção de DNS e domínios](#2-proteção-de-dns-e-domínios)
- [3. Governança do remetente padrão](#3-governança-do-remetente-padrão)
- [4. Gate de aprovação e suspensão](#4-gate-de-aprovação-e-suspensão)
- [5. Autorização consistente em todos os endpoints](#5-autorização-consistente-em-todos-os-endpoints)
- [6. Testes, migração e observabilidade](#6-testes-migração-e-observabilidade)

---

## 1. Quotas diárias por tenant
**Objetivo:** impedir que uma empresa estoure os limites definidos e afete reputação ou recursos globais.

- **1.1 Injetar `DailyQuotaService` no `EmailSendService`**
  - Chamar `checkQuota(companyId)` antes de criar registros no outbox.
  - Bloquear envio com `BadRequestException` (`DAILY_QUOTA_EXCEEDED`).
  - Reaproveitar payload atual retornado pelo service para informar `limit`, `current`, `resetsAt`.
- **1.2 Incrementar quota apenas quando o job for aceito**
  - Após enfileirar com sucesso, chamar `incrementQuota(companyId)`.
  - Garantir que falhas de enfileiramento mantenham contador consistente (try/catch).
- **1.3 Ajustar integração com worker para reprocessos**
  - Confirmar que `incrementQuota` acontece somente uma vez por envio (evitar contar retries).
  - Documentar estratégia: quota conta no ato do enqueue.
- **1.4 Cobertura de testes**
  - Tests unitários simulando limite atingido.
  - E2E/fake Redis validando bloqueio.

## 2. Proteção de DNS e domínios
**Objetivo:** impedir que um tenant veja ou altere registros DNS de outro.

- **2.1 Aplicar `ApiProtected()` ao `DNSRecordsController`**
  - Substituir rotas anônimas por guard de API Key + rate limit + auditoria.
- **2.2 Validar propriedade do domínio**
  - Em cada ação (`get`, `post`, `verify`, `delete`), checar se `domainId` pertence ao `companyId` do request.
  - Responder 404 quando domínio não pertencer ao tenant.
- **2.3 Revisar `DomainService`**
  - Reforçar filtros `companyId` em `listDomains`, `getDomainStatus`, `removeDomain` etc. (já presentes, apenas confirmar/tests).
- **2.4 Testes**
  - Casos positivos/negativos garantindo isolamento.

## 3. Governança do remetente padrão
**Objetivo:** garantir que apenas domínios verificados sejam usados em `defaultFromAddress`.

- **3.1 Bloquear atualização direta no `CompanyService.updateProfile`**
  - Remover setters livres de `defaultFromAddress`/`defaultFromName`.
  - Se necessário, disponibilizar endpoint separado que apenas salva remetente associado a domínio verificado.
- **3.2 Reforçar fluxo `setDefaultDomain`**
  - Manter geração de `defaultFromAddress` centralizada neste fluxo.
  - Adicionar validação caso o domínio perca a verificação posteriormente (opcional alerta).
- **3.3 Ajustar dashboard**
  - Atualizar UI (`ProfilePage`) para respeitar novo fluxo (leitura somente ou uso de ação dedicada).
- **3.4 Testes**
  - Cobrir tentativas de uso de domínio não verificado.

## 4. Gate de aprovação e suspensão
**Objetivo:** evitar envios quando o cliente ainda está em sandbox ou suspenso.

- **4.1 Propagar `isApproved` / `isSuspended` para o guard**
  - Atualizar `AuthService.validateApiKey` para incluir ambos no payload.
  - No `ApiKeyGuard`, impedir acesso quando `isSuspended === true` ou `isApproved === false` (opção: permitir apenas rotas de sandbox específicas).
- **4.2 Ajustar mensagens de erro**
  - Suspenso → `ForbiddenException('Company is suspended')`.
  - Não aprovado → `ForbiddenException('Company pending approval')`.
- **4.3 Revisitar rotas públicas**
  - Garantir que endpoints de registro/domínios iniciais suportem modo sandbox (ex.: quotas baixas).
- **4.4 Atualizar reputação/quota**
  - Confirmar que serviços consideram `isSuspended` para bloquear novas contagens.

## 5. Autorização consistente em todos os endpoints
**Objetivo:** padronizar uso de guards e auditoria.

- **5.1 Revisar controladores**
  - Conferir se todos os controllers públicos utilizam `@ApiProtected()` ou `@ApiKeyOnly()`.
  - Ex.: `EmailController` ainda acessa `req.user?.companyId`; substituir por decorator `@Company()`.
- **5.2 Documentar decorators**
  - Garantir que times usem `@Company()` para retirar `companyId` e evitem duplicação de lógica.
- **5.3 Auditoria**
  - Confirmar que o `AuditInterceptor` continua registrando ações com `companyId` para dashboards/admin.

## 6. Testes, migração e observabilidade
**Objetivo:** assegurar rollout seguro e monitorado.

- **6.1 Scripts/Migração**
  - Validar se não há necessidade de ajustes no schema (nenhuma coluna nova).
  - Caso quotas dependam de env var (`REDIS_URL`), documentar valores em `docs`.
- **6.2 Testes automatizados**
  - Atualizar suites em `apps/api` e `apps/worker` cobrindo cenários multi-tenant.
  - Adicionar testes para rotas de domínios e quota.
- **6.3 Observabilidade**
  - Criar métricas/logs específicos: quota bloqueada, tentativa de uso de domínio não verificado, suspensão automática.
  - Atualizar dashboards no Grafana (se necessário) para acompanhar contagem de bloqueios por tenant.
- **6.4 Rollout**
  - Plano de deploy: habilitar primeiro em ambiente de staging com dados mascarados.
  - Monitorar logs por 24h antes de liberar em produção.

---

## Critérios de Aceite
- Todos os endpoints multi-tenant respondem 403/404 quando consultados por tenant incorreto.
- Rotina de envio bloqueia tenants com quota excedida, não aprovados ou suspensos.
- Apenas domínios verificados podem ser usados como remetente padrão.
- Cobertura de testes atualizada e pipeline CI verde.
- Documentação nos arquivos `docs/` refletindo novos fluxos.
