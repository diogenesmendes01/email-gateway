# 📋 Tarefas para Produção - Email Gateway

**Data de criação:** 2025-10-23
**Última atualização:** 2025-10-23
**Status:** 17 tarefas identificadas (3 bloqueadores, 14 melhorias)

---

## 🎯 Objetivo

Deixar o código **100% funcional e pronto para produção** com **SMTP próprio (self-hosted)** como provider principal. AWS SES pode ser usado como backup opcional. Usamos BullMQ/Redis para gerenciamento de filas (não SNS nem SQS).

---

## 📊 Visão Geral

| Categoria | Bloqueador | Importante | Nice to Have | Total |
|-----------|------------|------------|--------------|-------|
| **Segurança** | 1 | 2 | 1 | 4 |
| **Testes** | 1 | 0 | 2 | 3 |
| **Build/Deploy** | 1 | 0 | 0 | 1 |
| **Observabilidade** | 0 | 2 | 0 | 2 |
| **Features** | 0 | 0 | 3 | 3 |
| **Performance** | 0 | 1 | 1 | 2 |
| **DevOps** | 0 | 0 | 1 | 1 |
| **Refatoração** | 0 | 0 | 2 | 2 |
| **TOTAL** | **3** | **5** | **10** | **18** |

**Tempo estimado total:**
- Bloqueadores: 4-6.5h
- Importantes: 9-14h
- Nice to Have: 19-28h
- **Total: 32-48.5h**

---

## 🚨 BLOQUEADORES CRÍTICOS (Resolver ANTES de produção)

### ✅ TASK-001: HTML Sanitization
**Arquivo:** `TASK-001-HTML-SANITIZATION.md`
**Categoria:** Segurança
**Urgência:** 1/5 (MÁXIMA)
**Tempo:** 2-4h
**Status:** 🔴 PENDENTE

**Problema:** Vulnerabilidade XSS crítica - sistema aceita HTML sem sanitização

**⚠️ BLOQUEADOR:** SIM - Não pode ir para produção!

---

### ✅ TASK-002: Corrigir Testes da API
**Arquivo:** `TASK-002-FIX-API-TESTS.md`
**Categoria:** Testes
**Urgência:** 2/5
**Tempo:** 1-2h
**Status:** 🔴 PENDENTE

**Problema:** 9 test suites falhando (24 testes), erro de import e type errors

**⚠️ BLOQUEADOR:** SIM - Sem testes, sem garantia de qualidade!

---

### ✅ TASK-003: Corrigir Dependencies Dashboard
**Arquivo:** `TASK-003-FIX-DASHBOARD-DEPS.md`
**Categoria:** Build/Deploy
**Urgência:** 2/5
**Tempo:** 30min
**Status:** 🔴 PENDENTE

**Problema:** Erro rollup - dashboard não builda

**⚠️ BLOQUEADOR:** SIM - Dashboard não pode ser deployado!

---

## 🔧 IMPORTANTES (Resolver após bloqueadores)

### ✅ TASK-004: Implementar Recipient API
**Arquivo:** `TASK-004-RECIPIENT-API.md`
**Categoria:** Features
**Urgência:** 3/5
**Tempo:** 4-6h
**Status:** 🟡 PENDENTE

**Problema:** Módulo recipient vazio - sem endpoints para gerenciar recipients

**⚠️ BLOQUEADOR:** NÃO - Recipients criados automaticamente ao enviar emails

---

### ✅ TASK-005: Structured Logging
**Arquivo:** `TASK-005-STRUCTURED-LOGGING.md`
**Categoria:** Observabilidade
**Urgência:** 3/5
**Tempo:** 2-3h
**Status:** 🟡 PENDENTE

**Problema:** console.log ao invés de Logger - prejudica observabilidade

---

### ✅ TASK-006: DNS Verification Real
**Arquivo:** `TASK-006-DNS-VERIFICATION-REAL.md`
**Categoria:** Features
**Urgência:** 3/5
**Tempo:** 3-4h
**Status:** 🟡 PENDENTE

**Problema:** Validação de DNS é stub (sempre true)

---

### ✅ TASK-007: Encryption Key Validation
**Arquivo:** `TASK-007-ENCRYPTION-KEY-VALIDATION.md`
**Categoria:** Segurança
**Urgência:** 2/5
**Tempo:** 2-3h
**Status:** 🟡 PENDENTE

**Problema:** Validação básica - aceita chaves fracas

---

### ✅ TASK-008: SES Health Check Quota
**Arquivo:** `TASK-008-SES-HEALTH-CHECK-QUOTA.md`
**Categoria:** Observabilidade
**Urgência:** 2/5
**Tempo:** 2-3h
**Status:** 🟡 PENDENTE

**Problema:** Health check não verifica quota SES

---

## 🎁 NICE TO HAVE (Pós-MVP)

### Segurança

#### TASK-015: MIME Type Validation
**Arquivo:** `TASK-015-MIME-TYPE-VALIDATION.md`
**Urgência:** 3/5 | **Tempo:** 2-3h

Validar MIME types de anexos (allowlist) - previne upload de arquivos maliciosos

---

### Resiliência

#### TASK-009: SES Circuit Breaker
**Arquivo:** `TASK-009-SES-CIRCUIT-BREAKER.md`
**Urgência:** 3/5 | **Tempo:** 3-4h

Implementar circuit breaker pattern para proteger contra falhas do SES

---

### Testes

#### TASK-010: Encryption Unit Tests
**Arquivo:** `TASK-010-ENCRYPTION-UNIT-TESTS.md`
**Urgência:** 3/5 | **Tempo:** 2-3h

Testes unitários de criptografia no EmailSendService

#### TASK-011: Encryption E2E Tests
**Arquivo:** `TASK-011-ENCRYPTION-E2E-TESTS.md`
**Urgência:** 3/5 | **Tempo:** 3-4h

Testes E2E do fluxo completo de criptografia

---

### Performance

#### TASK-012: Encryption Performance Monitoring
**Arquivo:** `TASK-012-ENCRYPTION-PERFORMANCE-MONITORING.md`
**Urgência:** 4/5 | **Tempo:** 1-2h

Monitorar latência de criptografia (PBKDF2)

#### TASK-017: Database Composite Index
**Arquivo:** `TASK-017-DATABASE-COMPOSITE-INDEX.md`
**Urgência:** 3/5 | **Tempo:** 1-2h

Índice composto para queries do dashboard (10-100x mais rápido)

---

### DevOps

#### TASK-013: Improve .env.example
**Arquivo:** `TASK-013-IMPROVE-ENV-EXAMPLE.md`
**Urgência:** 3/5 | **Tempo:** 1-2h

Melhorar .env.example com placeholders seguros e documentação

---

### Refatoração

#### TASK-014: Refactor Magic Numbers
**Arquivo:** `TASK-014-REFACTOR-MAGIC-NUMBERS.md`
**Urgência:** 4/5 | **Tempo:** 2-3h

Substituir números literais por constantes nomeadas

---

### Features

#### TASK-016: Domain Warm-up Logic
**Arquivo:** `TASK-016-DOMAIN-WARMUP-LOGIC.md`
**Urgência:** 4/5 | **Tempo:** 4-6h

Implementar lógica de warm-up gradual de domínios

---

## 📋 Índice de Tarefas (Por Número)

| # | Título | Categoria | Urgência | Tempo |
|---|--------|-----------|----------|-------|
| 001 | HTML Sanitization | Segurança | 1 🔴 | 2-4h |
| 002 | Fix API Tests | Testes | 2 🔴 | 1-2h |
| 003 | Fix Dashboard Deps | Build | 2 🔴 | 0.5h |
| 004 | Recipient API | Features | 3 🟡 | 4-6h |
| 005 | Structured Logging | Observabilidade | 3 🟡 | 2-3h |
| 006 | DNS Verification | Features | 3 🟡 | 3-4h |
| 007 | Encryption Key Validation | Segurança | 2 🟡 | 2-3h |
| 008 | SES Health Check Quota | Observabilidade | 2 🟡 | 2-3h |
| 009 | SES Circuit Breaker | Resiliência | 3 🟢 | 3-4h |
| 010 | Encryption Unit Tests | Testes | 3 🟢 | 2-3h |
| 011 | Encryption E2E Tests | Testes | 3 🟢 | 3-4h |
| 012 | Encryption Performance | Performance | 4 🟢 | 1-2h |
| 013 | Improve .env.example | DevOps | 3 🟢 | 1-2h |
| 014 | Refactor Magic Numbers | Refatoração | 4 🟢 | 2-3h |
| 015 | MIME Type Validation | Segurança | 3 🟢 | 2-3h |
| 016 | Domain Warm-up Logic | Features | 4 🟢 | 4-6h |
| 017 | Database Composite Index | Performance | 3 🟢 | 1-2h |

**Legenda:** 🔴 Bloqueador | 🟡 Importante | 🟢 Nice to Have

---

## 🚀 Plano de Execução Recomendado

### FASE 1: Resolver Bloqueadores (URGENTE - 1 dia)
**Tempo:** 4-6.5 horas

```bash
1. TASK-001: HTML Sanitization (2-4h) ← CRÍTICO SEGURANÇA
2. TASK-002: Corrigir Testes (1-2h)
3. TASK-003: Fix Dashboard (0.5h)
```

**Resultado:** ✅ Sistema seguro e pronto para produção

**Checklist:**
- [ ] TASK-001 implementada e testada
- [ ] TASK-002 implementada (100% testes passing)
- [ ] TASK-003 implementada (dashboard builda)
- [ ] Todos os testes passando
- [ ] Build de produção funciona
- [ ] Criar PR com as correções

---

### FASE 2: Configuração SMTP Self-Hosted (1-2 dias)
**Tempo:** Depende da configuração do servidor

```bash
1. Setup servidor SMTP (Postal, MailU, ou outro)
2. Configurar DNS (SPF, DKIM, DMARC)
3. Verificar domínio
4. Configurar variáveis de ambiente (.env)
5. Testes de envio
6. Configurar SES como backup (opcional)
7. Validação end-to-end
```

**Checklist:**
- [ ] Servidor SMTP configurado e funcionando
- [ ] DNS configurado (SPF, DKIM, DMARC)
- [ ] Domínio verificado
- [ ] Variáveis SMTP_* configuradas no .env
- [ ] ENCRYPTION_KEY gerada (openssl rand -base64 32)
- [ ] Database PostgreSQL configurado
- [ ] Redis configurado
- [ ] Envio de teste bem-sucedido
- [ ] SES configurado como backup (opcional)

---

### FASE 3: Deploy Produção (1 semana)
**Tempo:** Inclui estabilização

```bash
1. Deploy em staging
2. Load testing
3. Monitoring e alertas
4. Deploy em produção
5. Monitoring 24-48h
6. Validação final
```

**Checklist:**
- [ ] Deploy staging OK
- [ ] Load testing OK (2000 emails/hora)
- [ ] Monitoring funcionando
- [ ] Deploy produção OK
- [ ] Health checks OK
- [ ] Dashboard acessível
- [ ] Documentação atualizada

---

### FASE 4: Melhorias Importantes (1-2 semanas)
**Tempo:** 9-14 horas

**Prioridade 1 (Observabilidade):**
- TASK-005: Structured Logging (2-3h)
- TASK-008: SES Health Check Quota (2-3h)

**Prioridade 2 (Segurança):**
- TASK-007: Encryption Key Validation (2-3h)

**Prioridade 3 (Features):**
- TASK-004: Recipient API (4-6h)
- TASK-006: DNS Verification (3-4h)

---

### FASE 5: Melhorias Nice-to-Have (Backlog)
**Tempo:** 19-28 horas

Implementar conforme necessidade:
- Circuit Breaker (TASK-009)
- Testes adicionais (TASK-010, TASK-011)
- Performance (TASK-012, TASK-017)
- MIME validation (TASK-015)
- Domain warm-up (TASK-016)
- Refatorações (TASK-013, TASK-014)

---

## 📝 Como Usar Este Backlog

### Para Desenvolvedores

1. **Pegar uma tarefa:**
   ```bash
   # Abrir arquivo da tarefa
   cat task/TASK-XXX-NOME.md

   # Criar branch
   git checkout -b task-XXX-nome-curto
   ```

2. **Durante implementação:**
   - Seguir "O que precisa ser feito"
   - Implementar testes
   - Atualizar documentação

3. **Ao finalizar:**
   ```bash
   # Commit
   git add .
   git commit -m "feat: TASK-XXX - Descrição curta"

   # Push e PR
   git push origin task-XXX-nome-curto
   gh pr create --title "TASK-XXX: Título" --body "Resolves TASK-XXX"
   ```

4. **Marcar como concluída:**
   - Atualizar README.md (status da tarefa)
   - Mover arquivo para `task/archive/` (opcional)

### Para Product Owner

**Priorizar tarefas por:**
1. Bloqueadores primeiro (sempre)
2. ROI (retorno sobre investimento)
3. Risco (mitigar riscos altos primeiro)
4. Dependências (desbloquear outras tarefas)

**Decisões recomendadas:**
- ✅ Fazer TODAS as 3 bloqueadoras (obrigatório)
- ✅ Fazer 2-3 importantes (observabilidade + segurança)
- 🤔 Nice-to-have conforme roadmap

---

## 🔗 Arquivos de Referência

- **Template:** `TEMPLATE-PR-TASK.md` - Usar para criar novas tarefas
- **Análise completa:** Gerada pelo Claude Code (2025-10-23)
- **Documentação:** `/docs` (41+ arquivos)

---

## ✅ Status Atual do Projeto

**Implementação:** 85% completo
**Pronto para AWS SES:** ✅ SIM (após resolver bloqueadores)
**Pronto para Produção:** ⚠️ Após resolver 3 bloqueadores
**Tempo para produção:** 4-6.5 horas de desenvolvimento

### O que está COMPLETO ✅

- ✅ Core email sending (SMTP self-hosted + SES backup)
- ✅ Multi-provider architecture (Postal SMTP, AWS SES)
- ✅ Worker com BullMQ + Redis
- ✅ Database schema (8 models, 6 migrations)
- ✅ Criptografia AES-256-CBC + PBKDF2
- ✅ API Key authentication
- ✅ Rate limiting per-tenant
- ✅ Health checks
- ✅ Domain management (TASK 6.2)
- ✅ Dashboard básico
- ✅ Documentação (41+ arquivos)
- ✅ Testes (331 passing)

### O que FALTA ⚠️

**Bloqueadores (4-6.5h):**
- 🔴 HTML sanitization
- 🔴 Corrigir 24 testes falhando
- 🔴 Corrigir dependencies dashboard

**Nice-to-have:**
- Webhooks (SNS) - não faremos no MVP
- Recipient API completo
- Circuit breaker
- Warm-up automático
- Testes E2E adicionais

---

## 📞 Suporte

**Problemas?**
1. Verificar logs da aplicação
2. Consultar documentação em `/docs`
3. Revisar tarefa relacionada em `/task`
4. Abrir issue no repositório

**Dúvidas sobre tarefas:**
- Cada arquivo TASK-XXX.md tem seção "Detalhes Técnicos" completa
- Exemplos de código
- Testes sugeridos
- Referências

---

## 📈 Métricas de Progresso

### Por Status
- 🔴 Bloqueadores: **3 pendentes** (0% completo)
- 🟡 Importantes: **5 pendentes** (0% completo)
- 🟢 Nice-to-have: **9 pendentes** (0% completo)

### Por Categoria
- Segurança: 1/4 crítico implementado (constant-time comparison)
- Testes: 331/355 passing (93%)
- Observabilidade: Estrutura pronta, falta integração
- Features: 85% funcionalidades core implementadas

### Velocidade Estimada
- 1 dev full-time: 1-2 semanas para bloqueadores + importantes
- 2 devs: 3-5 dias para bloqueadores + importantes
- Sprint recomendado: 2 semanas (inclui testes e deploy)

---

**Última atualização:** 2025-10-23
**Próxima revisão:** Após completar TASK-001, TASK-002, TASK-003
**Versão:** 2.0 (análise completa com 17 tarefas)
