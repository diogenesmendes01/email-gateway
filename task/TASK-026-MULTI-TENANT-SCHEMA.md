# TASK-026 — Multi-Tenant Schema (Feature - Priority 1)

## Contexto
- Origem: MULTI_TENANT_PLAN.md - Sprint 1
- Resumo: Atualmente todos os emails são enviados do mesmo endereço (SES_FROM_ADDRESS global). Cada empresa precisa ter seu próprio domínio verificado, limites diários configuráveis, e sistema de curadoria para prevenir que clientes problemáticos afetem a reputação da conta AWS inteira.

## O que precisa ser feito
- [ ] Adicionar campos de domínio personalizado na Company (defaultFromAddress, defaultFromName, domainId)
- [ ] Adicionar campos de limites (dailyEmailLimit, monthlyEmailLimit)
- [ ] Adicionar campos de curadoria (isApproved, isSuspended, suspensionReason)
- [ ] Adicionar campos de métricas em cache (bounceRate, complaintRate, lastMetricsUpdate)
- [ ] Adicionar relation Company → Domain (defaultDomain)
- [ ] Adicionar relation Domain → Company (defaultForCompanies)
- [ ] Criar migration SQL
- [ ] Rodar migration e regenerar Prisma Client
- [ ] Criar seed para popular dados de teste

## Urgência
- **Nível (1–5):** 5 (CRÍTICO - Base para multi-tenant)

## Responsável sugerido
- Backend + Database

## Dependências / Riscos
- Dependências:
  - Prisma (já instalado)
  - PostgreSQL rodando
  - Tabela Domain já existe (TASK-006)
- Riscos:
  - BAIXO: Migration pode falhar se houver dados inconsistentes
  - BAIXO: Campos nullable evitam breaking changes
  - MÉDIO: Índices novos podem demorar em tabelas grandes

## Detalhes Técnicos

### 1. Atualizar schema.prisma

**Arquivo:** `packages/database/prisma/schema.prisma`

```prisma
model Company {
  id        String   @id @default(cuid())
  name      String
  apiKey    String   @unique @map("api_key")
  apiKeyHash String  @unique @map("api_key_hash") @db.VarChar(128)
  apiKeyPrefix String @map("api_key_prefix") @db.VarChar(20)
  apiKeyCreatedAt DateTime @map("api_key_created_at")
  apiKeyExpiresAt DateTime @map("api_key_expires_at")
  lastUsedAt DateTime? @map("last_used_at")
  isActive  Boolean  @default(true) @map("is_active")
  allowedIps String[] @default([]) @map("allowed_ips")
  rateLimitConfig Json? @map("rate_limit_config")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // ===== TASK-026: Campos Multi-Tenant =====

  // Domínio personalizado
  defaultFromAddress String?  @map("default_from_address") @db.VarChar(254)
  defaultFromName    String?  @map("default_from_name") @db.VarChar(100)
  domainId           String?  @map("domain_id")

  // Limites de envio
  dailyEmailLimit    Int      @default(1000) @map("daily_email_limit")
  monthlyEmailLimit  Int?     @map("monthly_email_limit")

  // Curadoria e Status
  isApproved         Boolean  @default(false) @map("is_approved")
  isSuspended        Boolean  @default(false) @map("is_suspended")
  suspensionReason   String?  @map("suspension_reason") @db.Text
  approvedAt         DateTime? @map("approved_at")
  approvedBy         String?  @map("approved_by") @db.VarChar(128)

  // Métricas em cache (atualizadas por cron job)
  bounceRate         Float    @default(0) @map("bounce_rate")
  complaintRate      Float    @default(0) @map("complaint_rate")
  lastMetricsUpdate  DateTime? @map("last_metrics_update")

  // Relations (existentes + novas)
  recipients   Recipient[]
  emailOutbox  EmailOutbox[]
  emailLogs    EmailLog[]
  idempotencyKeys IdempotencyKey[]
  auditLogs   AuditLog[]
  domains     Domain[] @relation("CompanyDomains") // Relação existente
  webhooks    Webhook[]
  recipientBlocklist RecipientBlocklist[]
  emailBatches EmailBatch[]

  // NOVA: Domínio padrão
  defaultDomain Domain? @relation("CompanyDefaultDomain", fields: [domainId], references: [id])

  @@index([isApproved, isSuspended], map: "idx_companies_approval_status")
  @@index([bounceRate], map: "idx_companies_bounce_rate")
  @@index([complaintRate], map: "idx_companies_complaint_rate")
  @@index([domainId], map: "idx_companies_domain_id")
  @@map("companies")
}

model Domain {
  id                    String                    @id @default(cuid())
  companyId             String                    @map("company_id")
  domain                String                    @db.VarChar(253)
  status                DomainVerificationStatus  @default(PENDING)
  dkimStatus            DKIMVerificationStatus    @default(PENDING)
  dkimTokens            String[]                  @default([]) @map("dkim_tokens")
  spfRecord             String?                   @map("spf_record") @db.VarChar(255)
  dkimRecords           Json?                     @map("dkim_records")
  dmarcRecord           String?                   @map("dmarc_record") @db.VarChar(255)
  lastChecked           DateTime?                 @map("last_checked")
  lastVerified          DateTime?                 @map("last_verified")
  errorMessage          String?                   @map("error_message") @db.Text
  warmupEnabled         Boolean                   @default(false) @map("warmup_enabled")
  warmupStartDate       DateTime?                 @map("warmup_start_date")
  warmupConfig          Json?                     @map("warmup_config")
  isProductionReady     Boolean                   @default(false) @map("is_production_ready")
  createdAt             DateTime                  @default(now()) @map("created_at")
  updatedAt             DateTime                  @updatedAt @map("updated_at")

  // Relations
  company Company @relation("CompanyDomains", fields: [companyId], references: [id], onDelete: Cascade)

  // NOVA: Empresas que usam este domínio como padrão
  defaultForCompanies Company[] @relation("CompanyDefaultDomain")

  @@unique([companyId, domain])
  @@index([companyId, status])
  @@index([domain])
  @@map("domains")
}
```

### 2. Criar migration

**Comando:**
```bash
cd packages/database
npx prisma migrate dev --name add_multi_tenant_fields
```

**Migration SQL gerada:** `packages/database/prisma/migrations/YYYYMMDD_add_multi_tenant_fields/migration.sql`

```sql
-- TASK-026: Add multi-tenant fields to companies table

-- Domínio personalizado
ALTER TABLE "companies" ADD COLUMN "default_from_address" VARCHAR(254);
ALTER TABLE "companies" ADD COLUMN "default_from_name" VARCHAR(100);
ALTER TABLE "companies" ADD COLUMN "domain_id" TEXT;

-- Limites de envio
ALTER TABLE "companies" ADD COLUMN "daily_email_limit" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "companies" ADD COLUMN "monthly_email_limit" INTEGER;

-- Curadoria e Status
ALTER TABLE "companies" ADD COLUMN "is_approved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "companies" ADD COLUMN "is_suspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "companies" ADD COLUMN "suspension_reason" TEXT;
ALTER TABLE "companies" ADD COLUMN "approved_at" TIMESTAMP(3);
ALTER TABLE "companies" ADD COLUMN "approved_by" VARCHAR(128);

-- Métricas em cache
ALTER TABLE "companies" ADD COLUMN "bounce_rate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "companies" ADD COLUMN "complaint_rate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "companies" ADD COLUMN "last_metrics_update" TIMESTAMP(3);

-- Foreign key para domínio padrão
ALTER TABLE "companies" ADD CONSTRAINT "companies_domain_id_fkey"
  FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE SET NULL;

-- Índices para performance
CREATE INDEX "idx_companies_approval_status" ON "companies"("is_approved", "is_suspended");
CREATE INDEX "idx_companies_bounce_rate" ON "companies"("bounce_rate");
CREATE INDEX "idx_companies_complaint_rate" ON "companies"("complaint_rate");
CREATE INDEX "idx_companies_domain_id" ON "companies"("domain_id");

-- Comentários
COMMENT ON COLUMN "companies"."default_from_address" IS 'Email address to send from (e.g., vendas@empresa.com)';
COMMENT ON COLUMN "companies"."daily_email_limit" IS 'Maximum emails per day (default: 1000 for sandbox)';
COMMENT ON COLUMN "companies"."is_approved" IS 'Company approved after curation (default: false for sandbox)';
COMMENT ON COLUMN "companies"."is_suspended" IS 'Company suspended due to poor reputation';
COMMENT ON COLUMN "companies"."bounce_rate" IS 'Cached bounce rate % (updated by cron)';
COMMENT ON COLUMN "companies"."complaint_rate" IS 'Cached complaint rate % (updated by cron)';
```

### 3. Regenerar Prisma Client

**Comandos:**
```bash
cd packages/database
npx prisma generate
```

Isso atualiza o tipo TypeScript do `PrismaClient` com os novos campos.

### 4. Verificar migration em desenvolvimento

**Comandos:**
```bash
# Ver status das migrations
npx prisma migrate status

# Verificar se migration foi aplicada
npx prisma db pull

# Testar queries
npx prisma studio
```

### 5. Seed para dados de teste

**Arquivo:** `packages/database/prisma/seed.ts` (atualizar)

```typescript
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Criar empresa de teste APROVADA (pode enviar emails)
  const approvedCompany = await prisma.company.upsert({
    where: { apiKeyPrefix: 'sk_test' },
    update: {},
    create: {
      name: 'Test Company (Approved)',
      apiKey: 'sk_test_approved_12345',
      apiKeyHash: await bcrypt.hash('sk_test_approved_12345', 10),
      apiKeyPrefix: 'sk_test',
      apiKeyCreatedAt: new Date(),
      apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 dias
      isActive: true,

      // TASK-026: Campos multi-tenant
      dailyEmailLimit: 5000,
      isApproved: true,
      approvedAt: new Date(),
      approvedBy: 'SEED_SCRIPT',
      bounceRate: 0.5,
      complaintRate: 0.01,
    },
  });

  console.log('✅ Created approved company:', approvedCompany.id);

  // 2. Criar empresa de teste NÃO APROVADA (sandbox)
  const sandboxCompany = await prisma.company.upsert({
    where: { apiKeyPrefix: 'sk_sand' },
    update: {},
    create: {
      name: 'Test Company (Sandbox)',
      apiKey: 'sk_sandbox_test_12345',
      apiKeyHash: await bcrypt.hash('sk_sandbox_test_12345', 10),
      apiKeyPrefix: 'sk_sand',
      apiKeyCreatedAt: new Date(),
      apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      isActive: true,

      // TASK-026: Sandbox mode (não aprovado)
      dailyEmailLimit: 100, // Limite baixo
      isApproved: false,
      bounceRate: 0,
      complaintRate: 0,
    },
  });

  console.log('✅ Created sandbox company:', sandboxCompany.id);

  // 3. Criar empresa SUSPENSA (má reputação)
  const suspendedCompany = await prisma.company.upsert({
    where: { apiKeyPrefix: 'sk_susp' },
    update: {},
    create: {
      name: 'Test Company (Suspended)',
      apiKey: 'sk_suspended_test_12345',
      apiKeyHash: await bcrypt.hash('sk_suspended_test_12345', 10),
      apiKeyPrefix: 'sk_susp',
      apiKeyCreatedAt: new Date(),
      apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      isActive: true,

      // TASK-026: Suspended (bounce rate alto)
      dailyEmailLimit: 1000,
      isApproved: true,
      isSuspended: true,
      suspensionReason: 'High bounce rate (6.5%) - Automatic suspension',
      bounceRate: 6.5,
      complaintRate: 0.02,
      lastMetricsUpdate: new Date(),
    },
  });

  console.log('✅ Created suspended company:', suspendedCompany.id);

  // 4. Criar domínio verificado para empresa aprovada
  const domain = await prisma.domain.upsert({
    where: {
      companyId_domain: {
        companyId: approvedCompany.id,
        domain: 'testcompany.com',
      },
    },
    update: {},
    create: {
      companyId: approvedCompany.id,
      domain: 'testcompany.com',
      status: 'VERIFIED',
      dkimStatus: 'VERIFIED',
      dkimTokens: ['token1', 'token2', 'token3'],
      isProductionReady: true,
    },
  });

  console.log('✅ Created verified domain:', domain.id);

  // 5. Definir como domínio padrão
  await prisma.company.update({
    where: { id: approvedCompany.id },
    data: {
      domainId: domain.id,
      defaultFromAddress: 'vendas@testcompany.com',
      defaultFromName: 'Equipe Vendas',
    },
  });

  console.log('✅ Set default domain for approved company');

  console.log('\n🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**Rodar seed:**
```bash
cd packages/database
npx prisma db seed
```

### 6. Validar schema

**Comandos:**
```bash
# Validar schema Prisma
npx prisma validate

# Ver schema aplicado no banco
npx prisma db pull

# Abrir Prisma Studio para inspeção visual
npx prisma studio
```

### 7. Testes de validação

**Arquivo:** `packages/database/tests/multi-tenant-fields.test.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('TASK-026: Multi-tenant fields', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should create company with multi-tenant fields', async () => {
    const company = await prisma.company.create({
      data: {
        name: 'Test Company',
        apiKey: 'sk_test_123',
        apiKeyHash: 'hash123',
        apiKeyPrefix: 'sk_test',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),

        // Multi-tenant fields
        dailyEmailLimit: 5000,
        isApproved: true,
        bounceRate: 1.2,
        complaintRate: 0.05,
      },
    });

    expect(company.dailyEmailLimit).toBe(5000);
    expect(company.isApproved).toBe(true);
    expect(company.isSuspended).toBe(false);
    expect(company.bounceRate).toBe(1.2);
    expect(company.complaintRate).toBe(0.05);
  });

  it('should create company with default domain', async () => {
    const company = await prisma.company.create({
      data: {
        name: 'Test Company 2',
        apiKey: 'sk_test_456',
        apiKeyHash: 'hash456',
        apiKeyPrefix: 'sk_test',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        domains: {
          create: {
            domain: 'example.com',
            status: 'VERIFIED',
            dkimStatus: 'VERIFIED',
          },
        },
      },
      include: {
        domains: true,
      },
    });

    // Set first domain as default
    const updatedCompany = await prisma.company.update({
      where: { id: company.id },
      data: {
        domainId: company.domains[0].id,
        defaultFromAddress: 'vendas@example.com',
        defaultFromName: 'Vendas',
      },
      include: {
        defaultDomain: true,
      },
    });

    expect(updatedCompany.defaultFromAddress).toBe('vendas@example.com');
    expect(updatedCompany.defaultFromName).toBe('Vendas');
    expect(updatedCompany.defaultDomain?.domain).toBe('example.com');
  });

  it('should query companies by approval status', async () => {
    const unapproved = await prisma.company.findMany({
      where: {
        isApproved: false,
        isSuspended: false,
      },
    });

    expect(Array.isArray(unapproved)).toBe(true);
  });

  it('should query companies by bounce rate', async () => {
    const highBounce = await prisma.company.findMany({
      where: {
        bounceRate: {
          gt: 5.0, // > 5%
        },
      },
    });

    expect(Array.isArray(highBounce)).toBe(true);
  });
});
```

**Rodar testes:**
```bash
npm test packages/database/tests/multi-tenant-fields.test.ts
```

## Categoria
**Feature - Database Schema**

## Bloqueador para Produção?
**SIM - CRÍTICO**

Sem estes campos:
- ❌ Impossível ter multi-tenant real
- ❌ Todos clientes compartilham mesmo limite
- ❌ Não há curadoria ou controle de qualidade
- ❌ Cliente problemático afeta todos os outros
- ❌ Impossível monitorar reputação por empresa

Com estes campos:
- ✅ Cada empresa tem seu domínio verificado
- ✅ Limites diários configuráveis por cliente
- ✅ Sistema de aprovação (sandbox → approved)
- ✅ Kill switch automático (suspensão por má reputação)
- ✅ Métricas em cache para dashboard

**Recomendação:** Implementar IMEDIATAMENTE como base para todo sistema multi-tenant.

## Checklist de Conclusão

- [ ] Schema atualizado (`schema.prisma`)
- [ ] Migration criada e aplicada
- [ ] Prisma Client regenerado
- [ ] Seed atualizado com dados de teste
- [ ] Prisma Studio verificado visualmente
- [ ] Testes unitários passando
- [ ] Documentação atualizada
- [ ] PR criado e revisado
- [ ] Merge na branch principal

## Próximos Passos

Após conclusão desta TASK:
- **TASK-027:** Modificar Worker para usar domínio da empresa
- **TASK-028:** Criar API de gerenciamento de domínios
