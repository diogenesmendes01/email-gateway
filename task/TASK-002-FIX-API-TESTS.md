# TASK-002 — Corrigir Testes Falhando da API

## Contexto
- Origem: Análise completa do código
- Resumo: 9 test suites falhando na API (24 testes), principalmente em `app.config.spec.ts` com erros de TypeScript e imports incorretos

## O que precisa ser feito
- [ ] Corrigir import path em `src/config/app.config.spec.ts` (linha 3)
- [ ] Adicionar index signature ao tipo de configuração para permitir acesso dinâmico
- [ ] Rodar testes novamente e garantir 100% passing
- [ ] Verificar cobertura de testes (target: 70%)
- [ ] Corrigir quaisquer outros testes que falharem
- [ ] Atualizar documentação de testes se necessário

## Urgência
- **Nível (1–5):** 2 (IMPORTANTE - Qualidade)

## Responsável sugerido
- Backend

## Dependências / Riscos
- Dependências: Nenhuma (apenas correções)
- Riscos:
  - Médio se não corrigido: Sem garantia de qualidade do código
  - Baixo após correção: Confiança na suite de testes

## Detalhes Técnicos

**Erro encontrado:**

```
src/config/app.config.spec.ts:3:34 - error TS2307:
Cannot find module '../src/config/app.config' or its corresponding type declarations.

src/config/app.config.spec.ts:30:16 - error TS7053:
Element implicitly has an 'any' type because expression of type 'string'
can't be used to index type '{ DATABASE_URL: string; ... }'.
```

**Correção 1 - Import Path:**

```typescript
// ANTES (linha 3)
import { AppConfigService } from '../src/config/app.config';

// DEPOIS
import { AppConfigService } from './app.config';
```

**Correção 2 - Type Index Signature:**

No arquivo `src/config/app.config.ts`, adicionar index signature:

```typescript
interface Config {
  DATABASE_URL: string;
  REDIS_URL: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  // ... outros campos

  // Adicionar index signature
  [key: string]: string | undefined;
}
```

Ou no teste, usar type assertion:

```typescript
// No teste (linha 30)
return (config as any)[key] || defaultValue;
```

**Verificação:**

```bash
# Rodar testes da API
cd apps/api
npm test

# Verificar cobertura
npm test -- --coverage

# Deve mostrar:
# Test Suites: X passed, X total
# Tests: Y passed, Y total
# Coverage: >= 70%
```

## Bloqueador para Produção?
**SIM** - Testes quebrados impedem validação de qualidade do código. Deve ser corrigido antes de produção.
