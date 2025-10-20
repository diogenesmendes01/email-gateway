# TASK 6.2 — Melhorias nos Testes

## 📋 Contexto

Durante a implementação da TASK 6.1 (Autenticação/Autorização, Rate Limit e Auditoria), foram identificados vários pontos de melhoria nos testes que precisam ser endereçados para garantir uma cobertura completa e qualidade do código.

## 🎯 Objetivo

Melhorar a cobertura de testes, corrigir testes falhando e implementar testes de integração para garantir a qualidade e confiabilidade do sistema de autenticação, rate limiting e auditoria.

## 🔒 Restrições

- **Backward Compatibility**: Não quebrar funcionalidades existentes
- **Performance**: Testes devem executar rapidamente
- **Coverage**: Manter cobertura de testes acima de 80%
- **CI/CD**: Testes devem passar no pipeline de CI/CD

## 📝 Especificações

### 6.2.1 — Correção de Testes Existentes

#### 6.2.1.1 — RateLimitGuard Tests
**Problema**: Testes falhando devido à implementação Redis
**Solução**:
- [ ] Corrigir mocks do RedisService para simular comportamento real
- [ ] Implementar testes para cenários de rate limiting com Redis
- [ ] Adicionar testes para falhas de conexão Redis (fail-open strategy)
- [ ] Testar headers de rate limit nas respostas

**Arquivos Afetados**:
- `apps/api/src/modules/auth/rate-limit.guard.spec.ts`

#### 6.2.1.2 — AuthService Tests
**Problema**: Testes básicos passando, mas cobertura incompleta
**Solução**:
- [ ] Adicionar testes para validação de API keys expiradas
- [ ] Testar cenários de IP allowlist
- [ ] Testar geração e rotação de API keys
- [ ] Testar validação de Basic Auth
- [ ] Testar logging de eventos de auditoria

**Arquivos Afetados**:
- `apps/api/src/modules/auth/auth.service.spec.ts`

#### 6.2.1.3 — RedisService Tests
**Problema**: Serviço sem testes
**Solução**:
- [ ] Criar testes unitários para RedisService
- [ ] Testar conexão e reconexão Redis
- [ ] Testar operações de rate limiting (incr, expire, ttl, get)
- [ ] Testar tratamento de erros de conexão

**Arquivos Afetados**:
- `apps/api/src/modules/auth/redis.service.spec.ts` (novo)

### 6.2.2 — Testes de Integração

#### 6.2.2.1 — Auth Module Integration Tests
**Objetivo**: Testar integração completa do módulo de autenticação
**Implementação**:
- [ ] Testes E2E para fluxo completo de autenticação
- [ ] Testes de integração API Key + Rate Limiting
- [ ] Testes de integração Basic Auth + Dashboard
- [ ] Testes de auditoria end-to-end

**Arquivos Afetados**:
- `apps/api/test/integration/auth.integration.spec.ts` (novo)

#### 6.2.2.2 — Email Send Integration Tests
**Objetivo**: Testar fluxo completo de envio de email com autenticação
**Implementação**:
- [ ] Testes E2E para POST /v1/email/send
- [ ] Testes de idempotência com autenticação
- [ ] Testes de rate limiting em endpoints protegidos
- [ ] Testes de auditoria em operações sensíveis

**Arquivos Afetados**:
- `apps/api/test/integration/email-send.integration.spec.ts` (novo)

### 6.2.3 — Testes de Performance

#### 6.2.3.1 — Rate Limiting Performance Tests
**Objetivo**: Garantir que rate limiting não impacta performance
**Implementação**:
- [ ] Testes de carga para rate limiting
- [ ] Benchmarks de latência com Redis
- [ ] Testes de concorrência para rate limiting
- [ ] Testes de memória para operações Redis

**Arquivos Afetados**:
- `apps/api/test/performance/rate-limit.performance.spec.ts` (novo)

### 6.2.4 — Testes de Segurança

#### 6.2.4.1 — Security Tests
**Objetivo**: Validar aspectos de segurança da implementação
**Implementação**:
- [ ] Testes de força bruta em API keys
- [ ] Testes de bypass de rate limiting
- [ ] Testes de validação de IP allowlist
- [ ] Testes de auditoria de tentativas de acesso não autorizado

**Arquivos Afetados**:
- `apps/api/test/security/auth.security.spec.ts` (novo)

### 6.2.5 — Testes de Auditoria

#### 6.2.5.1 — Audit Service Tests
**Problema**: AuditService no worker sem testes
**Solução**:
- [ ] Criar testes unitários para AuditService
- [ ] Testar criação e aprovação de break-glass requests
- [ ] Testar logging de eventos de auditoria
- [ ] Testar geração de relatórios de auditoria
- [ ] Testar limpeza de eventos antigos

**Arquivos Afetados**:
- `apps/worker/src/services/audit.service.spec.ts` (novo)

### 6.2.6 — Melhorias na Infraestrutura de Testes

#### 6.2.6.1 — Test Environment Setup
**Objetivo**: Melhorar ambiente de testes
**Implementação**:
- [ ] Configurar Redis de teste (Redis Memory Server)
- [ ] Configurar banco de dados de teste (SQLite in-memory)
- [ ] Criar fixtures para dados de teste
- [ ] Implementar setup/teardown automático

**Arquivos Afetados**:
- `apps/api/test/setup/test-setup.ts` (novo)
- `apps/api/jest.config.js` (atualizar)

#### 6.2.6.2 — Test Utilities
**Objetivo**: Criar utilitários para testes
**Implementação**:
- [ ] Factory para criação de dados de teste
- [ ] Helpers para autenticação em testes
- [ ] Mocks reutilizáveis para Redis
- [ ] Assertions customizadas para auditoria

**Arquivos Afetados**:
- `apps/api/test/utils/test-factories.ts` (novo)
- `apps/api/test/utils/auth-helpers.ts` (novo)
- `apps/api/test/utils/redis-mocks.ts` (novo)

## ✅ Critérios de Validação

### 6.2.1 — Cobertura de Testes
- [ ] **Unit Tests**: Cobertura mínima de 90% para módulos de auth
- [ ] **Integration Tests**: Cobertura mínima de 80% para fluxos críticos
- [ ] **E2E Tests**: Cobertura de 100% para endpoints protegidos

### 6.2.2 — Qualidade dos Testes
- [ ] **Todos os testes passando**: 0 testes falhando
- [ ] **Testes determinísticos**: Sem testes flaky
- [ ] **Testes rápidos**: Execução completa em menos de 30 segundos
- [ ] **Testes isolados**: Sem dependências entre testes

### 6.2.3 — Documentação
- [ ] **README de testes**: Documentação de como executar testes
- [ ] **Comentários**: Testes bem documentados
- [ ] **Exemplos**: Exemplos de uso dos utilitários de teste

## 🚀 Arquivos Afetados

### Novos Arquivos
- `apps/api/src/modules/auth/redis.service.spec.ts`
- `apps/api/test/integration/auth.integration.spec.ts`
- `apps/api/test/integration/email-send.integration.spec.ts`
- `apps/api/test/performance/rate-limit.performance.spec.ts`
- `apps/api/test/security/auth.security.spec.ts`
- `apps/worker/src/services/audit.service.spec.ts`
- `apps/api/test/setup/test-setup.ts`
- `apps/api/test/utils/test-factories.ts`
- `apps/api/test/utils/auth-helpers.ts`
- `apps/api/test/utils/redis-mocks.ts`

### Arquivos Modificados
- `apps/api/src/modules/auth/rate-limit.guard.spec.ts`
- `apps/api/src/modules/auth/auth.service.spec.ts`
- `apps/api/jest.config.js`
- `package.json` (scripts de teste)

## 🔄 Procedimentos de Fallback

### 6.2.1 — Se Testes Continuarem Falhando
1. **Identificar testes flaky**: Marcar como skip temporariamente
2. **Focar em testes críticos**: Priorizar testes de segurança
3. **Documentar problemas**: Criar issues para testes problemáticos
4. **Implementar gradualmente**: Fazer melhorias incrementais

### 6.2.2 — Se Performance dos Testes Degradar
1. **Otimizar mocks**: Usar mocks mais leves
2. **Paralelizar testes**: Configurar execução paralela
3. **Usar bancos in-memory**: Para testes mais rápidos
4. **Separar testes lentos**: Criar suite separada para testes de performance

## 📊 Métricas de Sucesso

- **Cobertura de Testes**: > 90% para módulos críticos
- **Tempo de Execução**: < 30 segundos para suite completa
- **Testes Falhando**: 0 testes falhando
- **Testes Flaky**: < 1% de testes instáveis
- **Confiança**: 100% dos testes passando no CI/CD

## 🎯 Prioridades

### Alta Prioridade (Sprint 1)
1. Corrigir RateLimitGuard tests
2. Criar RedisService tests
3. Implementar testes de integração básicos

### Média Prioridade (Sprint 2)
1. Melhorar AuthService tests
2. Implementar testes de segurança
3. Criar utilitários de teste

### Baixa Prioridade (Sprint 3)
1. Testes de performance
2. Testes E2E avançados
3. Melhorias na infraestrutura

---

**Criado em**: 2025-01-20  
**Autor**: AI Assistant  
**Status**: 📋 Planejado  
**Estimativa**: 3 sprints (6 semanas)
