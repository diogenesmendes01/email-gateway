# Shared Memory MCP - PR Review Guide

**Versão:** 1.0
**Data:** 2025-10-22
**Objetivo:** Guia completo de uso do Shared Memory MCP para PR reviews multi-agent

---

## 📋 Índice

1. [Introdução](#introdução)
2. [Arquitetura](#arquitetura)
3. [Tools Principais](#tools-principais)
4. [Fluxo Completo](#fluxo-completo)
5. [Exemplos Práticos](#exemplos-práticos)
6. [Token Efficiency](#token-efficiency)
7. [Troubleshooting](#troubleshooting)

---

## Introdução

### Problema Resolvido

**Antes (Sem Shared Memory):**
```
5 agents × 15k tokens = 75k tokens
Cada agent lê a PR inteira independentemente
```

**Depois (Com Shared Memory):**
```
1 coordenador lê PR = 15k tokens
6 workers obtêm contexto comprimido = 600 tokens cada
Total: ~20k tokens (73% de economia!)
```

### Benefícios

✅ **6x Token Efficiency** - 73% menos tokens
✅ **Parallel Execution** - 6 workers simultâneos
✅ **Zero Context Duplication** - Lê uma vez, compartilha N vezes
✅ **Incremental Updates** - Descobertas em tempo real
✅ **Smart Coordination** - Gerenciamento de dependências
✅ **Lazy Loading** - Expande seções sob demanda

---

## Arquitetura

```
┌───────────────────────────────────┐
│ PR Orchestrator (Coordenador)     │
│ - Lê PR completa (1×)            │
│ - Armazena no Shared Memory MCP  │
│ - Cria work units                │
│ - Coordena workers               │
└───────────────────────────────────┘
            │
            ├── 🗄️ Shared Memory MCP Server
            │   ├── Context Store (PR files)
            │   ├── Discovery Log (findings)
            │   ├── Work Queue (units)
            │   └── Session State
            │
            ├──> Worker 1: pr-test-reviewer
            ├──> Worker 2: pr-security-reviewer
            ├──> Worker 3: pr-database-reviewer
            ├──> Worker 4: pr-code-quality-reviewer
            ├──> Worker 5: pr-performance-reviewer
            └──> Worker 6: pr-docs-reviewer
```

---

## Tools Principais

### 1. `create_agentic_session`

**Propósito:** Inicializar sessão multi-agent com contexto compartilhado

**Quando usar:** No início do review, pelo coordenador

**Parâmetros:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `coordinator_id` | string | ID do coordenador (ex: 'pr-orchestrator') |
| `worker_ids` | array | Lista de worker IDs |
| `task_description` | string | Descrição da tarefa |
| `pr_metadata` | object | Metadados da PR |
| `zones` | object | Zonas com arquivos e contexto |
| `requirements` | array | Requisitos da review |

**Exemplo:**

```typescript
const session = await mcp.callTool('create_agentic_session', {
  coordinator_id: 'pr-orchestrator',
  worker_ids: [
    'pr-test-reviewer',
    'pr-security-reviewer',
    'pr-database-reviewer',
    'pr-code-quality-reviewer',
    'pr-performance-reviewer',
    'pr-docs-reviewer'
  ],
  task_description: 'Review PR #25: Task 9.1 - KPIs, estados e acesso',

  pr_metadata: {
    number: 25,
    title: 'Task 9.1 - KPIs, estados e acesso',
    author: 'diogenesmendes01',
    files_changed: 19,
    additions: 4248,
    deletions: 95
  },

  zones: {
    test: {
      files: [
        'apps/api/src/modules/dashboard/dashboard.service.spec.ts',
        'apps/api/src/modules/auth/admin.guard.spec.ts'
      ],
      context: {
        'apps/api/src/modules/dashboard/dashboard.service.spec.ts': '...[conteúdo completo]...',
        'apps/api/src/modules/auth/admin.guard.spec.ts': '...[conteúdo completo]...'
      },
      focus: 'Test coverage, AAA pattern, mocking'
    },
    auth: {
      files: ['apps/dashboard/src/contexts/AuthContext.tsx'],
      context: { /* ... */ },
      focus: 'Security vulnerabilities, XSS, CSRF'
    }
    // ... outras zones
  },

  requirements: [
    'Find BLOCKERS, CRITICAL, MAJOR, IMPROVEMENT issues',
    'Return findings in JSON format',
    'Include file:line references'
  ]
});

// Retorna: { session_id: 'sess_xyz123', ... }
```

**Token Usage:** ~15k (conteúdo completo da PR armazenado UMA VEZ)

---

### 2. `get_worker_context`

**Propósito:** Worker obtém contexto comprimido de sua zona

**Quando usar:** Worker inicia execução

**Parâmetros:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `session_id` | string | ID da sessão |
| `worker_id` | string | ID do worker |

**Exemplo:**

```typescript
const context = await mcp.callTool('get_worker_context', {
  session_id: 'sess_xyz123',
  worker_id: 'pr-test-reviewer'
});

// Retorna (comprimido, ~100 tokens):
{
  summary: "Review test files: dashboard.service.spec.ts (617 lines), admin.guard.spec.ts (250 lines). Focus: test coverage, AAA pattern, mocking.",
  zone: "test",
  focus: "Test coverage, AAA pattern, mocking, edge cases",
  reference_key: "zone_test_ctx_456",
  expansion_hints: ["zones.test.context"]
}
```

**Token Usage:** ~100 tokens (comprimido!)

---

### 3. `expand_context_section`

**Propósito:** Worker expande seção específica sob demanda (lazy loading)

**Quando usar:** Worker precisa do conteúdo completo dos arquivos

**Parâmetros:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `session_id` | string | ID da sessão |
| `section_key` | string | Chave da seção (ex: 'zones.test.context') |

**Exemplo:**

```typescript
const fullContext = await mcp.callTool('expand_context_section', {
  session_id: 'sess_xyz123',
  section_key: 'zones.test.context'
});

// Retorna conteúdo completo dos arquivos de teste (~2k tokens)
{
  'apps/api/src/modules/dashboard/dashboard.service.spec.ts': '...[conteúdo completo]...',
  'apps/api/src/modules/auth/admin.guard.spec.ts': '...[conteúdo completo]...'
}
```

**Token Usage:** ~2k tokens (apenas arquivos da zona test)

---

### 4. `publish_work_units`

**Propósito:** Coordenador publica unidades de trabalho para workers

**Quando usar:** Após criar sessão, antes de workers começarem

**Parâmetros:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `session_id` | string | ID da sessão |
| `work_units` | array | Lista de work units |

**Exemplo:**

```typescript
await mcp.callTool('publish_work_units', {
  session_id: 'sess_xyz123',
  work_units: [
    {
      unit_id: 'review-tests',
      type: 'testing',
      zone: 'test',
      priority: 'high',
      assigned_to: 'pr-test-reviewer',
      files_count: 3
    },
    {
      unit_id: 'review-security',
      type: 'security',
      zone: 'auth',
      priority: 'critical',
      assigned_to: 'pr-security-reviewer',
      files_count: 2
    },
    {
      unit_id: 'review-database',
      type: 'database',
      zone: 'database',
      priority: 'high',
      assigned_to: 'pr-database-reviewer',
      dependencies: [] // Pode rodar em paralelo
    }
    // ... outros work units
  ]
});
```

**Token Usage:** ~500 tokens

---

### 5. `claim_work_unit`

**Propósito:** Worker reivindica uma unidade de trabalho

**Quando usar:** Worker pronto para executar

**Parâmetros:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `session_id` | string | ID da sessão |
| `unit_id` | string | ID da work unit |
| `worker_id` | string | ID do worker |
| `estimated_duration_minutes` | number | Tempo estimado |

**Exemplo:**

```typescript
await mcp.callTool('claim_work_unit', {
  session_id: 'sess_xyz123',
  unit_id: 'review-tests',
  worker_id: 'pr-test-reviewer',
  estimated_duration_minutes: 5
});
```

**Token Usage:** ~50 tokens

---

### 6. `add_discovery`

**Propósito:** Worker publica um finding (incremental)

**Quando usar:** Quando worker encontra um issue

**Parâmetros:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `session_id` | string | ID da sessão |
| `worker_id` | string | ID do worker |
| `discovery_type` | string | Tipo: blocker, critical, major, improvement |
| `data` | object | Dados do finding |
| `affects_workers` | array | Workers afetados (opcional) |

**Exemplo:**

```typescript
await mcp.callTool('add_discovery', {
  session_id: 'sess_xyz123',
  worker_id: 'pr-test-reviewer',
  discovery_type: 'blocker',
  data: {
    severity: 'BLOCKER',
    title: 'Tests don\'t compile',
    file: 'dashboard.controller.spec.ts',
    line: 3,
    issue: 'supertest import error prevents test execution',
    fix: 'Change import * as request to import request',
    impact: '633 lines of tests cannot run'
  },
  affects_workers: [] // Blocker afeta todos
});
```

**Token Usage:** ~200 tokens por finding

---

### 7. `get_discoveries_since`

**Propósito:** Obter descobertas desde uma versão (incremental)

**Quando usar:** Coordenador agrega resultados ou workers consultam findings

**Parâmetros:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `session_id` | string | ID da sessão |
| `since_version` | number | Versão desde a qual buscar (0 = todas) |

**Exemplo:**

```typescript
const discoveries = await mcp.callTool('get_discoveries_since', {
  session_id: 'sess_xyz123',
  since_version: 0 // Pegar todas
});

// Retorna:
{
  discoveries: [
    {
      version: 1,
      worker_id: 'pr-test-reviewer',
      discovery_type: 'blocker',
      data: { /* finding details */ },
      timestamp: '2025-10-22T10:30:00Z'
    },
    {
      version: 2,
      worker_id: 'pr-security-reviewer',
      discovery_type: 'critical',
      data: { /* finding details */ },
      timestamp: '2025-10-22T10:30:15Z'
    }
    // ...
  ],
  latest_version: 15
}
```

**Token Usage:** ~1k tokens (delta incremental)

---

### 8. `update_work_status`

**Propósito:** Worker atualiza status da work unit

**Quando usar:** Worker completa ou atualiza progresso

**Parâmetros:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `session_id` | string | ID da sessão |
| `unit_id` | string | ID da work unit |
| `status` | string | Status: in_progress, completed, failed |
| `worker_id` | string | ID do worker |
| `summary` | object | Resumo do trabalho (opcional) |

**Exemplo:**

```typescript
await mcp.callTool('update_work_status', {
  session_id: 'sess_xyz123',
  unit_id: 'review-tests',
  status: 'completed',
  worker_id: 'pr-test-reviewer',
  summary: {
    score: 4,
    blockers: 2,
    critical: 2,
    major: 0,
    improvements: 0
  }
});
```

**Token Usage:** ~100 tokens

---

## Fluxo Completo

### Fase 1: Setup pelo Coordenador

```typescript
// 1. Obter info da PR
const prInfo = await gh.pr.view(25);
const files = await gh.pr.files(25);

// 2. Ler arquivos e categorizar em zones
const fileContents = await readAllFiles(files);
const zones = categorizePRFiles(files, fileContents);

// 3. Criar sessão
const session = await mcp.callTool('create_agentic_session', { ... });

// 4. Publicar work units
await mcp.callTool('publish_work_units', { ... });
```

**Tokens Fase 1:** ~16k tokens

### Fase 2: Execução Paralela pelos Workers

Cada worker executa:

```typescript
// 1. Obter contexto comprimido
const context = await mcp.callTool('get_worker_context', {
  session_id: SESSION_ID,
  worker_id: 'pr-test-reviewer'
}); // ~100 tokens

// 2. Expandir seção necessária
const fullContext = await mcp.callTool('expand_context_section', {
  session_id: SESSION_ID,
  section_key: 'zones.test.context'
}); // ~2k tokens

// 3. Reivindicar work unit
await mcp.callTool('claim_work_unit', { ... }); // ~50 tokens

// 4. Executar review
const findings = performReview(fullContext);

// 5. Publicar findings incrementalmente
for (const finding of findings.blockers) {
  await mcp.callTool('add_discovery', { ... }); // ~200 tokens cada
}

// 6. Marcar como completo
await mcp.callTool('update_work_status', { ... }); // ~100 tokens
```

**Tokens por Worker:** ~2.5k tokens (média)
**Total 6 Workers:** ~15k tokens (em paralelo)

### Fase 3: Agregação pelo Coordenador

```typescript
// 1. Obter todas as descobertas
const discoveries = await mcp.callTool('get_discoveries_since', {
  session_id: SESSION_ID,
  since_version: 0
}); // ~1k tokens

// 2. Agregar por severidade
const aggregated = {
  blockers: discoveries.filter(d => d.discovery_type === 'blocker'),
  critical: discoveries.filter(d => d.discovery_type === 'critical'),
  major: discoveries.filter(d => d.discovery_type === 'major'),
  improvements: discoveries.filter(d => d.discovery_type === 'improvement')
};

// 3. Gerar relatório final
return formatPRReviewReport({ ... });
```

**Tokens Fase 3:** ~2k tokens

---

## Token Efficiency

### Breakdown Detalhado

| Fase | Componente | Sem Shared Memory | Com Shared Memory | Economia |
|------|------------|-------------------|-------------------|----------|
| **Setup** | Coordenador lê PR | 15k | 15k | 0k |
| **Worker 1** | Contexto | 15k | 2.5k | 12.5k |
| **Worker 2** | Contexto | 15k | 2.5k | 12.5k |
| **Worker 3** | Contexto | 15k | 2.5k | 12.5k |
| **Worker 4** | Contexto | 15k | 2.5k | 12.5k |
| **Worker 5** | Contexto | 15k | 2.5k | 12.5k |
| **Worker 6** | Contexto | 15k | 2.5k | 12.5k |
| **Agregação** | Coordenador | 5k | 2k | 3k |
| **TOTAL** | | **110k** | **32k** | **78k (71%)** |

### Onde Vem a Economia?

1. **Context Deduplication** (60k saved)
   - Coordenador lê PR 1× em vez de 6×
   - Workers recebem summary (~100 tokens) em vez de full context (15k)

2. **Lazy Loading** (10k saved)
   - Workers expandem apenas seções necessárias
   - Não carregam arquivos irrelevantes

3. **Incremental Updates** (8k saved)
   - Findings publicados incrementalmente
   - Coordenador obtém delta em vez de full context

---

## Exemplos Práticos

### Exemplo 1: Review de PR Pequena (<500 linhas)

```bash
# Comando
use pr-orchestrator-v2-shared-memory para analisar PR #26

# Zones identificadas
- test: 2 arquivos
- backend: 3 arquivos

# Workers chamados
- pr-test-reviewer
- pr-code-quality-reviewer

# Token usage
- Coordenador: 5k
- Workers: 2 × 1.5k = 3k
- Total: 8k (vs 30k sem shared memory)
# Economia: 73%
```

### Exemplo 2: Review de PR Grande (4000+ linhas)

```bash
# Comando (mesmo da PR #25)
use pr-orchestrator-v2-shared-memory para analisar PR #25

# Zones identificadas
- test: 3 arquivos
- auth: 5 arquivos
- database: 2 arquivos
- backend: 5 arquivos
- frontend: 8 arquivos

# Workers chamados (todos os 6)
- pr-test-reviewer
- pr-security-reviewer
- pr-database-reviewer
- pr-code-quality-reviewer
- pr-performance-reviewer
- pr-docs-reviewer (skip - sem .md)

# Token usage
- Coordenador: 15k
- Workers: 5 × 2.5k = 12.5k
- Agregação: 2k
- Total: 29.5k (vs 110k sem shared memory)
# Economia: 73%
```

---

## Troubleshooting

### Problema: MCP Server não inicia

**Sintoma:** Erro ao chamar tools do MCP

**Solução:**
```bash
# Verificar se server está rodando
node ~/shared-memory-mcp/dist/server.js

# Verificar configuração
cat "$APPDATA/Claude/claude_desktop_config.json"

# Reiniciar Claude Desktop
```

### Problema: Worker não encontra contexto

**Sintoma:** `get_worker_context` retorna vazio

**Solução:**
```typescript
// Verificar se session foi criada
const session = await mcp.callTool('get_session_info', {
  session_id: SESSION_ID
});

// Verificar zones criadas
console.log(session.zones);
```

### Problema: Token usage ainda alto

**Sintoma:** Usando >50k tokens

**Solução:**
- Verificar se workers estão expandindo contexto desnecessariamente
- Usar `get_context_delta` em vez de re-ler contexto completo
- Considerar zones menores (mais específicas)

---

## Recursos Adicionais

- **Repositório:** https://github.com/haasonsaas/shared-memory-mcp
- **Helpers:** `~/shared-memory-mcp/pr-review-helpers.js`
- **Agente V2:** `.claude/agents/pr-orchestrator-v2-shared-memory.md`

---

**Criado por:** Architecture Team
**Data:** 2025-10-22
**Versão:** 1.0
