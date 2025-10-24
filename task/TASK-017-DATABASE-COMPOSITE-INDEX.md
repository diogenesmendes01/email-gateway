# TASK-017 — Índice Composto para Queries de Dashboard (Performance)

## Contexto
- Origem: PR-BACKLOG (PR2-TASK-01)
- Resumo: Queries do dashboard filtram por `companyId + status + createdAt`. Sem índice composto, performance degrada com volume

## O que precisa ser feito
- [ ] Criar migration com índice composto
- [ ] Validar impacto em queries existentes com EXPLAIN ANALYZE
- [ ] Testar performance antes/depois com dataset realista
- [ ] Documentar índice no schema
- [ ] Adicionar comentários explicando uso do índice

## Urgência
- **Nível (1–5):** 3 (MODERADO - Performance)

## Responsável sugerido
- Backend/DBA

## Dependências / Riscos
- Dependências: Nenhuma
- Riscos:
  - Baixo: Melhoria de performance
  - Índice adicional usa espaço em disco (< 1% do tamanho da tabela)
  - Pode impactar INSERT performance levemente (< 5%)

## Detalhes Técnicos

**Query típica do dashboard:**

```sql
SELECT *
FROM email_outbox
WHERE company_id = 'company-123'
  AND status IN ('SENT', 'FAILED')
  AND created_at >= '2025-01-01'
ORDER BY created_at DESC
LIMIT 20;
```

**Problema sem índice composto:**

```sql
EXPLAIN ANALYZE
SELECT * FROM email_outbox
WHERE company_id = 'abc' AND status = 'SENT'
ORDER BY created_at DESC
LIMIT 20;

-- Resultado (lento):
-- Seq Scan on email_outbox  (cost=0.00..50000.00 rows=1000 width=500)
-- Planning Time: 1.234 ms
-- Execution Time: 125.456 ms  <-- LENTO!
```

**Com índice composto:**

```sql
-- Resultado (rápido):
-- Index Scan using idx_email_outbox_dashboard on email_outbox
-- Planning Time: 0.123 ms
-- Execution Time: 2.345 ms  <-- RÁPIDO! (50x mais rápido)
```

**Criar Migration:**

```bash
npx prisma migrate create add_dashboard_composite_index
```

**Migration SQL:** `packages/database/prisma/migrations/YYYYMMDD_add_dashboard_composite_index/migration.sql`

```sql
-- CreateIndex
-- Composite index for dashboard queries
-- Optimizes: WHERE company_id = X AND status = Y ORDER BY created_at DESC
CREATE INDEX "idx_email_outbox_dashboard" ON "email_outbox"("company_id", "status", "created_at" DESC);

-- Add comment explaining index usage
COMMENT ON INDEX "idx_email_outbox_dashboard" IS
'Composite index for dashboard email list queries.
 Optimizes queries filtering by company_id + status + date range with ORDER BY created_at DESC.
 Used by: DashboardController.getEmails(), EmailController.listEmails()';
```

**Atualizar Prisma Schema:** `packages/database/prisma/schema.prisma`

```prisma
model EmailOutbox {
  id            String   @id @default(cuid())
  companyId     String   @map("company_id")
  status        EmailStatus
  createdAt     DateTime @default(now()) @map("created_at")
  sentAt        DateTime? @map("sent_at")
  // ... outros campos

  // Índices existentes
  @@index([companyId])
  @@index([status])
  @@index([createdAt])

  // NOVO: Índice composto para dashboard
  @@index([companyId, status, createdAt(sort: Desc)], name: "idx_email_outbox_dashboard")

  @@map("email_outbox")
}
```

**Validação de Performance:**

```sql
-- Script de teste de performance
-- Executar ANTES e DEPOIS de criar índice

-- 1. Popular tabela com dados de teste (se necessário)
INSERT INTO email_outbox (company_id, status, created_at, ...)
SELECT
  'company-' || (random() * 100)::int,
  (ARRAY['PENDING', 'SENT', 'FAILED'])[floor(random() * 3 + 1)],
  NOW() - (random() * INTERVAL '365 days'),
  ...
FROM generate_series(1, 100000); -- 100k registros

-- 2. Analisar query SEM índice
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM email_outbox
WHERE company_id = 'company-50'
  AND status = 'SENT'
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 20;

-- Salvar resultados: Execution Time = XXX ms

-- 3. Criar índice
CREATE INDEX idx_email_outbox_dashboard
ON email_outbox(company_id, status, created_at DESC);

-- 4. Atualizar estatísticas
ANALYZE email_outbox;

-- 5. Analisar query COM índice
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM email_outbox
WHERE company_id = 'company-50'
  AND status = 'SENT'
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 20;

-- Comparar: Execution Time deve ser 10-100x menor

-- 6. Verificar tamanho do índice
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE indexrelname = 'idx_email_outbox_dashboard';
```

**Queries beneficiadas:**

```typescript
// 1. Dashboard - Lista de emails
async function getEmails(companyId: string, status: EmailStatus) {
  return prisma.emailOutbox.findMany({
    where: {
      companyId,
      status, // Usa índice composto
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

// 2. Dashboard - Emails por período
async function getEmailsByDateRange(
  companyId: string,
  status: EmailStatus,
  startDate: Date,
  endDate: Date
) {
  return prisma.emailOutbox.findMany({
    where: {
      companyId,
      status,
      createdAt: {
        gte: startDate,
        lte: endDate,
      }, // Usa índice composto
    },
    orderBy: { createdAt: 'desc' },
  });
}

// 3. API - Listagem com filtros
async function listEmails(filters: EmailFilters) {
  return prisma.emailOutbox.findMany({
    where: {
      companyId: filters.companyId,
      status: {
        in: filters.statuses, // Usa índice composto
      },
      createdAt: {
        gte: filters.startDate,
      },
    },
    orderBy: { createdAt: 'desc' },
    skip: filters.skip,
    take: filters.limit,
  });
}
```

**Monitoramento pós-deploy:**

```sql
-- Verificar uso do índice em produção
SELECT
  schemaname,
  tablename,
  indexrelname,
  idx_scan,  -- Número de vezes que índice foi usado
  idx_tup_read, -- Tuplas lidas via índice
  idx_tup_fetch -- Tuplas buscadas via índice
FROM pg_stat_user_indexes
WHERE indexrelname = 'idx_email_outbox_dashboard'
ORDER BY idx_scan DESC;

-- Se idx_scan = 0 após alguns dias, índice não está sendo usado
-- Investigar com EXPLAIN para descobrir por quê
```

**Testes:**

```typescript
describe('Dashboard Query Performance', () => {
  beforeAll(async () => {
    // Popular com 10k registros de teste
    await seedDatabase(10000);
  });

  it('should use composite index for dashboard query', async () => {
    // Query real do dashboard
    const startTime = Date.now();

    const emails = await prisma.emailOutbox.findMany({
      where: {
        companyId: 'test-company',
        status: 'SENT',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const duration = Date.now() - startTime;

    expect(emails).toHaveLength(20);
    expect(duration).toBeLessThan(100); // < 100ms com índice
  });

  it('should perform well with multiple status filter', async () => {
    const startTime = Date.now();

    const emails = await prisma.emailOutbox.findMany({
      where: {
        companyId: 'test-company',
        status: {
          in: ['SENT', 'FAILED'],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(150);
  });
});
```

**Documentação:**

```markdown
## Database Indexes

### Composite Indexes

#### idx_email_outbox_dashboard
- **Columns:** `(company_id, status, created_at DESC)`
- **Purpose:** Optimize dashboard email list queries
- **Queries optimized:**
  - Dashboard email list with filters
  - Email search by company + status
  - Date range queries with sorting
- **Performance impact:** 10-100x faster than sequential scan
- **Size:** ~5-10% of table size
```

## Categoria
**Performance - Database Optimization**

## Bloqueador para Produção?
**NÃO** - Mas recomendado. Sistema funciona sem índice, apenas mais lento com volume alto.

## Quando Implementar
- **Agora:** Se já há mais de 10k emails no banco
- **Futuro:** Se queries do dashboard ficarem lentas (> 500ms)
- **Monitorar:** Slow query logs, dashboard response time
