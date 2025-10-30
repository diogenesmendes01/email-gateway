# Plano de Migração: AWS SES → ESP Self-Hosted

> **Data de Criação:** 30 de Outubro de 2025
> **Status:** Planejamento
> **Autor:** Análise Técnica Completa

---

## 📋 Sumário Executivo

Este documento mapeia **todas as mudanças e adaptações** necessárias para transformar o `email-gateway` atual (dependente de AWS SES) em um **ESP (Email Service Provider) self-hosted** completo, mantendo AWS SES como uma opção toggle (ativado/desativado).

### Objetivos Principais

1. **AWS SES como Toggle**: Manter SES como opção configurável (on/off)
2. **ESP Self-Hosted**: Criar driver SMTP/API próprio com MTA (Postal/Mailu/Haraka)
3. **Funcionalidades Avançadas**: Implementar todos os recursos de um ESP profissional

---

## 🔍 Análise do Estado Atual

### Arquitetura Existente

**Stack Tecnológico:**
- **API**: NestJS + TypeScript
- **Worker**: Node.js + BullMQ
- **Queue**: Redis (BullMQ)
- **Database**: PostgreSQL + Prisma ORM
- **Email Provider**: AWS SES (hard-coded)
- **Webhooks**: AWS SNS → SES Events

**Dependências do AWS SES:**
1. `SESService` (`apps/worker/src/services/ses.service.ts`) - envio direto
2. `SESEventProcessorService` - processamento de bounces/complaints/delivery via SNS
3. `SESWebhookService` - recebimento de webhooks SNS
4. `DomainManagementService` - verificação de domínios via AWS SES API
5. Configuração SES (`apps/worker/src/config/ses.config.ts`)

**Pontos Fortes Existentes:**
- ✅ Sistema de filas robusto (BullMQ + Redis)
- ✅ Retry com backoff exponencial
- ✅ Blocklist (hard bounce + complaints)
- ✅ Métricas e monitoramento (Prometheus)
- ✅ Multi-tenant (por Company)
- ✅ Rate limiting básico
- ✅ Domain management e DKIM
- ✅ Warm-up configuration

---

## 🎯 Escopo das Mudanças

### Fase 1: AWS SES como Toggle ✅
- Abstrair `SESService` para interface `IEmailDriver`
- Criar sistema de configuração por provider
- Manter compatibilidade 100% com código existente

### Fase 2: Driver SMTP/API Self-Hosted 🚀
- Implementar driver Postal/Mailu/Haraka
- IP pools (transacional, marketing, dedicado)
- Rate limit por MX (Gmail, Outlook, Yahoo)
- Envelope-From dedicado por domínio

### Fase 3: Webhooks & Ingest 📥
- Parser DSN (Delivery Status Notification)
- Parser ARF (Abuse Reporting Format)
- Processamento de opens/clicks
- Sistema de supressão avançado

### Fase 4: Onboarding & DNS Automation 🌐
- Geração automática de DKIM 2048-bit
- Checklist DNS (DKIM/SPF/Return-Path/Tracking)
- Verificação automática de registros DNS
- Return-Path dedicado por cliente

### Fase 5: Métricas & Guardrails 📊
- Dashboard por tenant/domínio
- Pausar envios se bounce ≥2% ou complaint ≥0,1%
- Warm-up automático
- Postmaster/DMARC ingest (Gmail Postmaster, MS SNDS)

---

## 📦 1. MUDANÇAS NO BANCO DE DADOS

### 1.1 Novos Enums

```prisma
// Provider de email
enum EmailProvider {
  AWS_SES
  POSTAL_SMTP
  POSTAL_API
  MAILU_SMTP
  HARAKA_API
  CUSTOM_SMTP
}

// Tipos de IP pool
enum IPPoolType {
  TRANSACTIONAL  // Alta prioridade, 2FA, recibos
  MARKETING      // Newsletters, campanhas
  DEDICATED      // IP dedicado por cliente
  SHARED         // Pool compartilhado
}

// Tipos de rate limit
enum RateLimitScope {
  MX_DOMAIN      // Por MX (gmail.com, outlook.com)
  CUSTOMER_DOMAIN // Por domínio do cliente
  IP_ADDRESS     // Por IP de envio
  GLOBAL         // Global do sistema
}

// Tipos de supressão
enum SuppressionReason {
  HARD_BOUNCE
  SOFT_BOUNCE
  SPAM_COMPLAINT
  UNSUBSCRIBE
  ROLE_ACCOUNT    // admin@, info@, etc
  BAD_DOMAIN
  MANUAL
}

// Status de onboarding de domínio
enum DomainOnboardingStatus {
  DNS_PENDING
  DNS_CONFIGURED
  DKIM_PENDING
  DKIM_VERIFIED
  SPF_PENDING
  SPF_VERIFIED
  RETURN_PATH_PENDING
  RETURN_PATH_VERIFIED
  WARMUP_IN_PROGRESS
  PRODUCTION_READY
  FAILED
}
```

### 1.2 Tabela: `email_providers` (Nova)

```prisma
model EmailProvider {
  id            String   @id @default(cuid())
  companyId     String?  @map("company_id") // null = global
  provider      EmailProvider @default(AWS_SES)
  isActive      Boolean  @default(true) @map("is_active")
  priority      Int      @default(0) // 0 = mais alta
  
  // Configuração genérica (JSON)
  config        Json     // { host, port, user, pass, api_key, etc }
  
  // Limites por provider
  dailyLimit    Int?     @map("daily_limit")
  hourlyLimit   Int?     @map("hourly_limit")
  
  // Tracking
  sentToday     Int      @default(0) @map("sent_today")
  sentThisHour  Int      @default(0) @map("sent_this_hour")
  lastReset     DateTime @default(now()) @map("last_reset")
  
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  
  // Relations
  company       Company? @relation(fields: [companyId], references: [id])
  
  @@unique([companyId, provider])
  @@index([isActive, priority])
  @@map("email_providers")
}
```

### 1.3 Tabela: `ip_pools` (Nova)

```prisma
model IPPool {
  id            String      @id @default(cuid())
  name          String      @db.VarChar(100)
  type          IPPoolType
  ipAddresses   String[]    @map("ip_addresses") // IPs do pool
  isActive      Boolean     @default(true) @map("is_active")
  
  // Limites
  dailyLimit    Int?        @map("daily_limit")
  hourlyLimit   Int?        @map("hourly_limit")
  
  // Tracking
  sentToday     Int         @default(0) @map("sent_today")
  reputation    Float       @default(100.0) // 0-100
  
  // Warm-up
  warmupEnabled Boolean     @default(false) @map("warmup_enabled")
  warmupConfig  Json?       @map("warmup_config")
  
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")
  
  @@index([type, isActive])
  @@map("ip_pools")
}
```

### 1.4 Tabela: `rate_limits` (Nova)

```prisma
model RateLimit {
  id            String          @id @default(cuid())
  scope         RateLimitScope
  target        String          @db.VarChar(253) // MX domain, IP, etc
  
  // Limites
  perMinute     Int?            @map("per_minute")
  perHour       Int?            @map("per_hour")
  perDay        Int?            @map("per_day")
  
  // Janelas deslizantes (Redis)
  lastMinute    Int             @default(0) @map("last_minute")
  lastHour      Int             @default(0) @map("last_hour")
  lastDay       Int             @default(0) @map("last_day")
  
  // Tracking
  lastReset     DateTime        @default(now()) @map("last_reset")
  
  createdAt     DateTime        @default(now()) @map("created_at")
  updatedAt     DateTime        @updatedAt @map("updated_at")
  
  @@unique([scope, target])
  @@index([scope, target, lastReset])
  @@map("rate_limits")
}
```

### 1.5 Tabela: `suppressions` (Nova - Substitui `recipient_blocklist`)

```prisma
model Suppression {
  id            String              @id @default(cuid())
  companyId     String?             @map("company_id") // null = global
  email         String              @db.VarChar(254)
  domain        String?             @db.VarChar(253)
  reason        SuppressionReason
  
  // Metadata
  source        String?             @db.VarChar(64) // bounce, complaint, manual
  bounceType    String?             @map("bounce_type") @db.VarChar(32)
  diagnosticCode String?            @map("diagnostic_code") @db.Text
  
  // Timing
  suppressedAt  DateTime            @default(now()) @map("suppressed_at")
  expiresAt     DateTime?           @map("expires_at") // Para soft bounces
  
  // Relations
  company       Company?            @relation(fields: [companyId], references: [id])
  
  @@unique([companyId, email])
  @@index([reason, suppressedAt])
  @@index([domain, reason])
  @@map("suppressions")
}
```

### 1.6 Tabela: `dns_records` (Nova)

```prisma
model DNSRecord {
  id            String                    @id @default(cuid())
  domainId      String                    @map("domain_id")
  recordType    String                    @db.VarChar(10) // TXT, CNAME, MX
  name          String                    @db.VarChar(253)
  value         String                    @db.Text
  priority      Int?
  isVerified    Boolean                   @default(false) @map("is_verified")
  lastChecked   DateTime?                 @map("last_checked")
  
  createdAt     DateTime                  @default(now()) @map("created_at")
  updatedAt     DateTime                  @updatedAt @map("updated_at")
  
  // Relations
  domain        Domain                    @relation(fields: [domainId], references: [id], onDelete: Cascade)
  
  @@index([domainId, recordType])
  @@map("dns_records")
}
```

### 1.7 Tabela: `domain_onboarding` (Nova)

```prisma
model DomainOnboarding {
  id            String                    @id @default(cuid())
  domainId      String                    @unique @map("domain_id")
  status        DomainOnboardingStatus    @default(DNS_PENDING)
  
  // Checklist items
  dkimGenerated Boolean                   @default(false) @map("dkim_generated")
  dkimPublic    String?                   @db.Text @map("dkim_public")
  dkimPrivate   String?                   @db.Text @map("dkim_private") // ENCRYPTED
  dkimSelector  String?                   @db.VarChar(63) @map("dkim_selector")
  
  spfRecord     String?                   @db.VarChar(512) @map("spf_record")
  returnPath    String?                   @db.VarChar(253) @map("return_path")
  trackingDomain String?                  @db.VarChar(253) @map("tracking_domain")
  
  // Auto-verification
  lastCheckAt   DateTime?                 @map("last_check_at")
  nextCheckAt   DateTime?                 @map("next_check_at")
  checkAttempts Int                       @default(0) @map("check_attempts")
  
  // Production readiness
  readyForProduction Boolean                @default(false) @map("ready_for_production")
  productionApprovedAt DateTime?            @map("production_approved_at")
  productionApprovedBy String?              @db.VarChar(128) @map("production_approved_by")
  
  createdAt     DateTime                  @default(now()) @map("created_at")
  updatedAt     DateTime                  @updatedAt @map("updated_at")
  
  // Relations
  domain        Domain                    @relation(fields: [domainId], references: [id], onDelete: Cascade)
  
  @@map("domain_onboarding")
}
```

### 1.8 Tabela: `email_tracking` (Nova)

```prisma
model EmailTracking {
  id            String   @id @default(cuid())
  emailLogId    String   @map("email_log_id")
  trackingId    String   @unique @db.VarChar(64) @map("tracking_id")
  
  // Events
  openedAt      DateTime? @map("opened_at")
  openCount     Int       @default(0) @map("open_count")
  clickedAt     DateTime? @map("clicked_at")
  clickCount    Int       @default(0) @map("click_count")
  
  // Click details
  clickedUrls   Json?     @map("clicked_urls") // Array de { url, timestamp }
  
  // User agent
  userAgent     String?   @db.Text @map("user_agent")
  ipAddress     String?   @db.VarChar(45) @map("ip_address")
  
  createdAt     DateTime  @default(now()) @map("created_at")
  
  // Relations
  emailLog      EmailLog  @relation(fields: [emailLogId], references: [id], onDelete: Cascade)
  
  @@index([emailLogId])
  @@index([trackingId])
  @@map("email_tracking")
}
```

### 1.9 Tabela: `reputation_metrics` (Nova)

```prisma
model ReputationMetric {
  id              String   @id @default(cuid())
  companyId       String?  @map("company_id") // null = global
  domainId        String?  @map("domain_id")
  ipPoolId        String?  @map("ip_pool_id")
  
  date            DateTime @db.Date
  
  // Métricas
  sent            Int      @default(0)
  delivered       Int      @default(0)
  bounced         Int      @default(0)
  bouncedHard     Int      @default(0) @map("bounced_hard")
  bouncedSoft     Int      @default(0) @map("bounced_soft")
  complained      Int      @default(0)
  opened          Int      @default(0)
  clicked         Int      @default(0)
  
  // Taxas calculadas
  bounceRate      Float    @default(0) @map("bounce_rate")
  complaintRate   Float    @default(0) @map("complaint_rate")
  openRate        Float    @default(0) @map("open_rate")
  clickRate       Float    @default(0) @map("click_rate")
  
  // Reputação
  reputationScore Float    @default(100) @map("reputation_score")
  
  createdAt       DateTime @default(now()) @map("created_at")
  
  // Relations
  company         Company?  @relation(fields: [companyId], references: [id])
  domain          Domain?   @relation(fields: [domainId], references: [id])
  ipPool          IPPool?   @relation(fields: [ipPoolId], references: [id])
  
  @@unique([companyId, domainId, ipPoolId, date])
  @@index([date, companyId])
  @@map("reputation_metrics")
}
```

### 1.10 Atualizações em Tabelas Existentes

**`companies`:**
```prisma
// Adicionar campos
providerConfig    Json?   @map("provider_config") // Config específica por empresa
defaultProviderId String? @map("default_provider_id")
defaultIPPoolId   String? @map("default_ip_pool_id")
```

**`domains`:**
```prisma
// Adicionar campos
onboardingStatus  DomainOnboardingStatus @default(DNS_PENDING) @map("onboarding_status")
returnPathDomain  String?                @db.VarChar(253) @map("return_path_domain")
trackingDomain    String?                @db.VarChar(253) @map("tracking_domain")

// Relations
dnsRecords        DNSRecord[]
onboarding        DomainOnboarding?
reputationMetrics ReputationMetric[]
```

**`email_logs`:**
```prisma
// Adicionar campos
provider          EmailProvider?         // Qual provider foi usado
ipPoolId          String?                @map("ip_pool_id")
ipAddress         String?                @db.VarChar(45) @map("ip_address")
dsnReport         Json?                  @map("dsn_report") // DSN completo
arfReport         Json?                  @map("arf_report") // ARF completo
trackingId        String?                @unique @map("tracking_id")

// Relations
tracking          EmailTracking?
```

---

## 🏗️ 2. MUDANÇAS NA ARQUITETURA

### 2.1 Nova Estrutura de Drivers

```
apps/worker/src/
├── drivers/
│   ├── base/
│   │   ├── email-driver.interface.ts       // Interface base
│   │   └── email-driver-result.ts          // Types compartilhados
│   ├── aws-ses/
│   │   ├── ses-driver.ts                   // Implementação SES (refatorado)
│   │   ├── ses-config.ts
│   │   └── ses-event-parser.ts
│   ├── postal/
│   │   ├── postal-smtp-driver.ts           // Postal via SMTP
│   │   ├── postal-api-driver.ts            // Postal via API
│   │   └── postal-webhook-parser.ts        // Parser de webhooks Postal
│   ├── mailu/
│   │   ├── mailu-smtp-driver.ts            // Mailu via SMTP
│   │   └── mailu-webhook-parser.ts
│   ├── haraka/
│   │   ├── haraka-api-driver.ts            // Haraka via API
│   │   └── haraka-webhook-parser.ts
│   └── driver-factory.ts                    // Factory para criar drivers
```

### 2.2 Interface `IEmailDriver` (Base)

```typescript
interface IEmailDriver {
  // Envio
  sendEmail(job: EmailSendJobData, config: DriverConfig): Promise<SendResult>;
  
  // Validação
  validateConfig(): Promise<boolean>;
  
  // Quota/Limits
  getQuota(): Promise<QuotaInfo | null>;
  
  // DNS/Domínios
  verifyDomain(domain: string): Promise<DomainVerification>;
  
  // IP Pools (se suportado)
  getIPPools?(): Promise<IPPool[]>;
  selectIPPool?(job: EmailSendJobData): Promise<string | null>;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  provider: EmailProvider;
  ipAddress?: string;
  error?: MappedError;
}

interface DriverConfig {
  provider: EmailProvider;
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  apiKey?: string;
  region?: string;
  ipPoolId?: string;
  [key: string]: any;
}
```

### 2.3 Driver Factory

```typescript
class DriverFactory {
  static create(provider: EmailProvider, config: DriverConfig): IEmailDriver {
    switch (provider) {
      case EmailProvider.AWS_SES:
        return new SESDriver(config);
      case EmailProvider.POSTAL_SMTP:
        return new PostalSMTPDriver(config);
      case EmailProvider.POSTAL_API:
        return new PostalAPIDriver(config);
      case EmailProvider.MAILU_SMTP:
        return new MailuSMTPDriver(config);
      case EmailProvider.HARAKA_API:
        return new HarakaAPIDriver(config);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}
```

### 2.4 Novo Serviço: `EmailDriverService`

```typescript
// apps/worker/src/services/email-driver.service.ts
class EmailDriverService {
  async sendEmailWithFallback(
    job: EmailSendJobData,
    companyId: string
  ): Promise<SendResult> {
    // 1. Obter providers configurados (prioridade)
    const providers = await this.getActiveProviders(companyId);
    
    // 2. Tentar cada provider até sucesso
    for (const provider of providers) {
      try {
        const driver = DriverFactory.create(provider.provider, provider.config);
        const result = await driver.sendEmail(job, provider.config);
        
        if (result.success) {
          await this.recordSuccess(provider.id, job);
          return result;
        }
      } catch (error) {
        await this.recordFailure(provider.id, error);
        // Continue para próximo provider
      }
    }
    
    throw new Error('All providers failed');
  }
}
```

---

## 🔧 3. MUDANÇAS NA API

### 3.1 Novos Endpoints

#### **Email Providers**
```
POST   /v1/admin/providers              # Criar provider
GET    /v1/admin/providers              # Listar providers
PUT    /v1/admin/providers/:id          # Atualizar provider
DELETE /v1/admin/providers/:id          # Remover provider
POST   /v1/admin/providers/:id/test     # Testar provider
```

#### **IP Pools**
```
POST   /v1/admin/ip-pools               # Criar IP pool
GET    /v1/admin/ip-pools               # Listar IP pools
PUT    /v1/admin/ip-pools/:id           # Atualizar IP pool
GET    /v1/admin/ip-pools/:id/metrics   # Métricas do pool
```

#### **Rate Limits**
```
POST   /v1/admin/rate-limits            # Criar rate limit
GET    /v1/admin/rate-limits            # Listar rate limits
PUT    /v1/admin/rate-limits/:id        # Atualizar rate limit
```

#### **Suppressions**
```
POST   /v1/suppressions                 # Adicionar supressão
GET    /v1/suppressions                 # Listar supressões
DELETE /v1/suppressions/:id             # Remover supressão
POST   /v1/suppressions/import          # Importar lista
POST   /v1/suppressions/check           # Verificar email
```

#### **Domain Onboarding**
```
POST   /v1/domains/:id/onboarding/start         # Iniciar onboarding
GET    /v1/domains/:id/onboarding/status        # Status do onboarding
POST   /v1/domains/:id/onboarding/verify        # Verificar DNS
POST   /v1/domains/:id/onboarding/generate-dkim # Gerar par DKIM
GET    /v1/domains/:id/onboarding/checklist     # Checklist completo
```

#### **Reputation & Metrics**
```
GET    /v1/reputation                           # Reputação da empresa
GET    /v1/reputation/domain/:id                # Reputação do domínio
GET    /v1/reputation/alerts                    # Alertas ativos
GET    /v1/metrics/dashboard                    # Dashboard completo
GET    /v1/metrics/postmaster                   # Gmail Postmaster (se configurado)
```

#### **Tracking**
```
GET    /track/open/:trackingId                  # Pixel de abertura
GET    /track/click/:trackingId/:linkId         # Redirect de clique
```

### 3.2 Novos Serviços

```
apps/api/src/modules/
├── provider/
│   ├── provider.controller.ts
│   ├── provider.service.ts
│   └── dto/
├── ip-pool/
│   ├── ip-pool.controller.ts
│   └── ip-pool.service.ts
├── rate-limit/
│   ├── rate-limit.controller.ts
│   └── rate-limit.service.ts
├── suppression/
│   ├── suppression.controller.ts
│   ├── suppression.service.ts
│   └── import/
├── onboarding/
│   ├── onboarding.controller.ts
│   ├── onboarding.service.ts
│   ├── dkim-generator.service.ts
│   └── dns-verifier.service.ts
├── reputation/
│   ├── reputation.controller.ts
│   ├── reputation.service.ts
│   └── postmaster.service.ts
└── tracking/
    ├── tracking.controller.ts
    └── tracking.service.ts
```

---

## ⚙️ 4. MUDANÇAS NO WORKER

### 4.1 Novos Serviços

#### **DSN Parser Service**
```typescript
// apps/worker/src/services/dsn-parser.service.ts
class DSNParserService {
  parseDSN(rawDSN: string): DSNReport {
    // Parse RFC 3464 Delivery Status Notification
    // Extrai: action, status, diagnostic-code, etc
  }
  
  classifyBounce(dsn: DSNReport): {
    type: 'hard' | 'soft' | 'transient';
    reason: string;
    shouldSuppress: boolean;
  }
}
```

#### **ARF Parser Service**
```typescript
// apps/worker/src/services/arf-parser.service.ts
class ARFParserService {
  parseARF(rawARF: string): ARFReport {
    // Parse RFC 5965 Abuse Reporting Format
    // Extrai: feedback-type, user-agent, source-ip, etc
  }
  
  extractComplaint(arf: ARFReport): ComplaintInfo {
    // Extrai informações relevantes de spam complaint
  }
}
```

#### **MX Rate Limiter Service**
```typescript
// apps/worker/src/services/mx-rate-limiter.service.ts
class MXRateLimiterService {
  async checkLimit(recipientEmail: string): Promise<boolean> {
    const mxDomain = this.extractMXDomain(recipientEmail);
    const limit = await this.getMXLimit(mxDomain);
    
    return await this.rateLimiter.checkAndIncrement(
      `mx:${mxDomain}`,
      limit
    );
  }
  
  private getMXLimit(mxDomain: string): RateLimit {
    // Gmail: 20 msgs/segundo
    // Outlook: 10 msgs/segundo
    // Yahoo: 5 msgs/segundo
    // Default: 1 msg/segundo
  }
}
```

#### **Return-Path Service**
```typescript
// apps/worker/src/services/return-path.service.ts
class ReturnPathService {
  generateReturnPath(
    recipientEmail: string,
    companyDomain: string
  ): string {
    // bounce+<hash>@bounce.cliente.com
    const hash = this.generateHash(recipientEmail);
    return `bounce+${hash}@bounce.${companyDomain}`;
  }
  
  parseReturnPath(returnPath: string): {
    originalRecipient: string;
    companyDomain: string;
  }
}
```

#### **Warmup Scheduler Service**
```typescript
// apps/worker/src/services/warmup-scheduler.service.ts
class WarmupSchedulerService {
  async getDailyLimit(domain: string): Promise<number> {
    const warmup = await this.getWarmupConfig(domain);
    
    if (!warmup.enabled) {
      return warmup.maxDailyVolume;
    }
    
    const daysSinceStart = this.daysSince(warmup.startDate);
    return this.calculateWarmupLimit(daysSinceStart, warmup.schedule);
  }
  
  private calculateWarmupLimit(day: number, schedule: WarmupSchedule): number {
    // Dia 1: 50 emails
    // Dia 2: 100 emails
    // Dia 3: 200 emails
    // ...crescimento gradual até limite
  }
}
```

### 4.2 Novos Workers

```typescript
// apps/worker/src/webhook-ingest-worker.ts
class WebhookIngestWorker {
  async process(job: Job<WebhookData>) {
    const { provider, payload } = job.data;
    
    switch (provider) {
      case 'postal':
        await this.processPostalWebhook(payload);
        break;
      case 'mailu':
        await this.processMailuWebhook(payload);
        break;
      // ...
    }
  }
  
  private async processPostalWebhook(payload: any) {
    // Parse bounce/complaint/delivery
    // Atualizar email_logs
    // Adicionar à suppression se necessário
    // Trigger client webhooks
  }
}
```

```typescript
// apps/worker/src/dns-verification-worker.ts
class DNSVerificationWorker {
  async process(job: Job<DomainVerificationJob>) {
    const { domainId } = job.data;
    
    // 1. Buscar records esperados
    const expectedRecords = await this.getExpectedDNSRecords(domainId);
    
    // 2. Verificar cada record via DNS lookup
    const results = await Promise.all(
      expectedRecords.map(r => this.verifyRecord(r))
    );
    
    // 3. Atualizar status no banco
    await this.updateDomainOnboardingStatus(domainId, results);
    
    // 4. Se tudo OK, marcar como PRODUCTION_READY
    if (this.allRecordsValid(results)) {
      await this.markProductionReady(domainId);
    }
  }
}
```

```typescript
// apps/worker/src/reputation-calculator-worker.ts
class ReputationCalculatorWorker {
  async process(job: Job) {
    const companies = await this.getAllCompanies();
    
    for (const company of companies) {
      const metrics = await this.calculateMetrics(company.id);
      
      await this.saveReputationMetric({
        companyId: company.id,
        date: new Date(),
        ...metrics,
        reputationScore: this.calculateScore(metrics),
      });
      
      // Verificar guardrails
      if (metrics.bounceRate >= 0.02 || metrics.complaintRate >= 0.001) {
        await this.triggerAlert(company.id, metrics);
        await this.pauseSending(company.id);
      }
    }
  }
}
```

---

## 📝 5. IMPLEMENTAÇÕES ESPECÍFICAS

### 5.1 Driver Postal (SMTP)

```typescript
// apps/worker/src/drivers/postal/postal-smtp-driver.ts
export class PostalSMTPDriver implements IEmailDriver {
  private transporter: nodemailer.Transporter;
  
  constructor(config: DriverConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.auth.user,
        pass: config.auth.pass,
      },
    });
  }
  
  async sendEmail(job: EmailSendJobData, config: DriverConfig): Promise<SendResult> {
    // 1. Selecionar IP pool
    const ipPool = await this.selectIPPool(job);
    
    // 2. Gerar Return-Path dedicado
    const returnPath = this.generateReturnPath(job);
    
    // 3. Construir headers
    const headers = {
      'List-Unsubscribe': this.buildUnsubscribeHeader(job),
      'List-Id': `<${job.companyId}.emails.certshift.com>`,
      'X-IP-Pool': ipPool?.name,
      ...job.headers,
    };
    
    // 4. Verificar rate limit MX
    await this.checkMXRateLimit(job.to);
    
    // 5. Enviar via SMTP
    const info = await this.transporter.sendMail({
      from: config.fromAddress,
      to: job.to,
      subject: job.subject,
      html: job.htmlContent,
      headers,
      envelope: {
        from: returnPath,
        to: job.to,
      },
    });
    
    return {
      success: true,
      messageId: info.messageId,
      provider: EmailProvider.POSTAL_SMTP,
      ipAddress: ipPool?.ipAddresses[0],
    };
  }
}
```

### 5.2 Webhook Ingest (Postal)

```typescript
// apps/api/src/modules/webhook/postal-webhook.controller.ts
@Controller('webhooks/postal')
export class PostalWebhookController {
  @Post()
  async handleWebhook(@Body() payload: any) {
    // 1. Validar signature (HMAC)
    if (!this.validateSignature(payload)) {
      throw new UnauthorizedException();
    }
    
    // 2. Parse evento
    const event = this.parsePostalEvent(payload);
    
    // 3. Enfileirar para processamento
    await this.queueService.enqueue('webhook-ingest', {
      provider: 'postal',
      event,
      receivedAt: new Date(),
    });
    
    return { status: 'accepted' };
  }
  
  private parsePostalEvent(payload: any): WebhookEvent {
    switch (payload.event) {
      case 'MessageDelivered':
        return {
          type: 'delivery',
          messageId: payload.message.id,
          timestamp: payload.timestamp,
        };
      case 'MessageBounced':
        return {
          type: 'bounce',
          messageId: payload.message.id,
          bounceType: this.classifyBounce(payload.bounce),
          diagnosticCode: payload.bounce.code,
        };
      case 'MessageComplaint':
        return {
          type: 'complaint',
          messageId: payload.message.id,
          feedbackType: payload.complaint.type,
        };
    }
  }
}
```

### 5.3 DKIM Generator

```typescript
// apps/api/src/modules/onboarding/dkim-generator.service.ts
export class DKIMGeneratorService {
  async generateKeyPair(domain: string): Promise<DKIMKeyPair> {
    // Gerar par RSA 2048-bit
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });
    
    // Gerar selector (ex: s20251030)
    const selector = this.generateSelector();
    
    // Formatar public key para DNS TXT record
    const dnsValue = this.formatPublicKeyForDNS(publicKey);
    
    return {
      selector,
      publicKey: dnsValue,
      privateKey: await this.encryptPrivateKey(privateKey),
      dnsRecord: {
        type: 'TXT',
        name: `${selector}._domainkey.${domain}`,
        value: `v=DKIM1; k=rsa; p=${dnsValue}`,
      },
    };
  }
  
  private generateSelector(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `s${date}`; // s20251030
  }
}
```

### 5.4 DNS Auto-Verification

```typescript
// apps/api/src/modules/onboarding/dns-verifier.service.ts
export class DNSVerifierService {
  async verifyAllRecords(domainId: string): Promise<VerificationResult> {
    const domain = await this.getDomain(domainId);
    const onboarding = await this.getOnboarding(domainId);
    
    const checks = await Promise.all([
      this.verifyDKIM(domain, onboarding),
      this.verifySPF(domain),
      this.verifyReturnPath(domain, onboarding),
    ]);
    
    const allPassed = checks.every(c => c.valid);
    
    if (allPassed) {
      await this.markProductionReady(domainId);
    }
    
    return {
      domain: domain.domain,
      checks,
      allPassed,
      productionReady: allPassed,
    };
  }
  
  private async verifyDKIM(domain: Domain, onboarding: DomainOnboarding): Promise<CheckResult> {
    const record = `${onboarding.dkimSelector}._domainkey.${domain.domain}`;
    
    try {
      const result = await dns.resolveTxt(record);
      const txtValue = result[0].join('');
      
      // Verificar se contém a chave pública
      const hasPublicKey = txtValue.includes(onboarding.dkimPublic);
      
      return {
        type: 'DKIM',
        record,
        expected: `v=DKIM1; k=rsa; p=${onboarding.dkimPublic}`,
        found: txtValue,
        valid: hasPublicKey,
      };
    } catch (error) {
      return {
        type: 'DKIM',
        record,
        valid: false,
        error: 'DNS record not found',
      };
    }
  }
}
```

### 5.5 MX Rate Limiter (Redis)

```typescript
// apps/worker/src/services/mx-rate-limiter.service.ts
export class MXRateLimiterService {
  private readonly limits = {
    'gmail.com': { perSecond: 20, perMinute: 1000 },
    'googlemail.com': { perSecond: 20, perMinute: 1000 },
    'outlook.com': { perSecond: 10, perMinute: 500 },
    'hotmail.com': { perSecond: 10, perMinute: 500 },
    'yahoo.com': { perSecond: 5, perMinute: 250 },
    'default': { perSecond: 1, perMinute: 50 },
  };
  
  async checkLimit(email: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const mxDomain = this.extractMXDomain(email);
    const limit = this.limits[mxDomain] || this.limits.default;
    
    // Sliding window no Redis
    const key = `mx:${mxDomain}:${Math.floor(Date.now() / 1000)}`;
    const count = await this.redis.incr(key);
    await this.redis.expire(key, 60);
    
    if (count > limit.perSecond) {
      const retryAfter = 1000; // 1 segundo
      return { allowed: false, retryAfter };
    }
    
    return { allowed: true };
  }
  
  private extractMXDomain(email: string): string {
    const domain = email.split('@')[1].toLowerCase();
    
    // Normalizar domínios conhecidos
    if (domain.includes('gmail')) return 'gmail.com';
    if (domain.includes('googlemail')) return 'gmail.com';
    if (domain.includes('outlook')) return 'outlook.com';
    if (domain.includes('hotmail')) return 'outlook.com';
    if (domain.includes('yahoo')) return 'yahoo.com';
    
    return domain;
  }
}
```

### 5.6 Suppression Service

```typescript
// apps/api/src/modules/suppression/suppression.service.ts
export class SuppressionService {
  async addToSuppression(data: {
    companyId?: string;
    email: string;
    reason: SuppressionReason;
    source?: string;
    expiresAt?: Date;
  }): Promise<void> {
    const domain = data.email.split('@')[1];
    
    await prisma.suppression.upsert({
      where: {
        companyId_email: {
          companyId: data.companyId || null,
          email: data.email,
        },
      },
      create: {
        ...data,
        domain,
      },
      update: {
        reason: data.reason,
        source: data.source,
        suppressedAt: new Date(),
      },
    });
  }
  
  async checkSuppression(companyId: string, email: string): Promise<{
    suppressed: boolean;
    reason?: string;
  }> {
    // Verificar supressão por empresa
    const companySuppression = await prisma.suppression.findUnique({
      where: {
        companyId_email: { companyId, email },
      },
    });
    
    if (companySuppression) {
      return {
        suppressed: true,
        reason: companySuppression.reason,
      };
    }
    
    // Verificar supressão global
    const globalSuppression = await prisma.suppression.findFirst({
      where: {
        companyId: null,
        email,
      },
    });
    
    if (globalSuppression) {
      return {
        suppressed: true,
        reason: globalSuppression.reason,
      };
    }
    
    // Verificar role accounts (admin@, info@, postmaster@, etc)
    if (this.isRoleAccount(email)) {
      return {
        suppressed: true,
        reason: 'role_account',
      };
    }
    
    return { suppressed: false };
  }
  
  private isRoleAccount(email: string): boolean {
    const roleAccounts = [
      'admin', 'info', 'postmaster', 'abuse', 'noreply',
      'support', 'help', 'contact', 'sales', 'webmaster',
    ];
    
    const localPart = email.split('@')[0].toLowerCase();
    return roleAccounts.includes(localPart);
  }
}
```

### 5.7 Reputation Monitor

```typescript
// apps/worker/src/services/reputation-monitor.service.ts
export class ReputationMonitorService {
  async checkAndEnforce(companyId: string): Promise<void> {
    const metrics = await this.calculateLast24hMetrics(companyId);
    
    // Guardrail: Bounce Rate ≥ 2%
    if (metrics.bounceRate >= 0.02) {
      await this.pauseSending(companyId, 'High bounce rate detected');
      await this.sendAlert(companyId, {
        type: 'high_bounce_rate',
        value: metrics.bounceRate,
        threshold: 0.02,
      });
    }
    
    // Guardrail: Complaint Rate ≥ 0.1%
    if (metrics.complaintRate >= 0.001) {
      await this.pauseSending(companyId, 'High complaint rate detected');
      await this.sendAlert(companyId, {
        type: 'high_complaint_rate',
        value: metrics.complaintRate,
        threshold: 0.001,
      });
    }
    
    // Warmup: verificar se está dentro do limite diário
    const warmupLimit = await this.warmupScheduler.getDailyLimit(companyId);
    if (metrics.sentToday >= warmupLimit) {
      await this.throttleSending(companyId, 'Daily warmup limit reached');
    }
  }
  
  private async calculateLast24hMetrics(companyId: string): Promise<Metrics> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const [sent, bounced, complained] = await Promise.all([
      prisma.emailLog.count({
        where: {
          companyId,
          status: 'SENT',
          sentAt: { gte: since },
        },
      }),
      prisma.emailLog.count({
        where: {
          companyId,
          bounceType: { not: null },
          createdAt: { gte: since },
        },
      }),
      prisma.emailLog.count({
        where: {
          companyId,
          complaintFeedbackType: { not: null },
          createdAt: { gte: since },
        },
      }),
    ]);
    
    return {
      sent,
      bounced,
      complained,
      bounceRate: sent > 0 ? bounced / sent : 0,
      complaintRate: sent > 0 ? complained / sent : 0,
      sentToday: sent,
    };
  }
}
```

---

## 🔄 6. PLANO DE MIGRAÇÃO - 3 TRACKS PARALELAS

> **Estratégia:** Dividir o trabalho em 3 tracks independentes para 3 desenvolvedores trabalharem simultaneamente, minimizando conflitos de merge.

---

## 🎯 RESUMO DAS 3 TRACKS

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     DIVISÃO DE RESPONSABILIDADES                         │
└──────────────────────────────────────────────────────────────────────────┘

👤 PERSON A (Track 1)         👤 PERSON B (Track 2)         👤 PERSON C (Track 3)
Backend Sênior                Backend Pleno/Sênior          Full-Stack
─────────────────────────     ─────────────────────────     ─────────────────────────
📂 apps/worker/src/drivers/   📂 apps/worker/src/services/  📂 apps/api/src/modules/
📂 apps/api/src/modules/      📂 apps/api/src/modules/      📂 apps/dashboard/src/
   ├─ ip-pool/                   ├─ webhook/                   └─ onboarding/
   ├─ provider/                  ├─ suppression/                  └─ pages/
   └─ rate-limit/                ├─ tracking/
                                 └─ reputation/

🎯 FOCO:                      🎯 FOCO:                      🎯 FOCO:
• Drivers de envio            • Webhooks & Parsers          • DNS & DKIM
• IP Pools                    • DSN/ARF                     • Onboarding automático
• Rate limiting MX            • Supressão                   • Dashboard
• Providers & Fallback        • Reputação & Guardrails      • Frontend
                             • Tracking opens/clicks       • Postmaster

⏱️ DURAÇÃO: 12 semanas        ⏱️ DURAÇÃO: 12 semanas        ⏱️ DURAÇÃO: 12 semanas

🔀 MERGES: Sprint 1,2,3,4,5   🔀 MERGES: Sprint 2,3,4,5,6   🔀 MERGES: Sprint 2,3,4,5,6
```

### ⚡ Vantagens da Abordagem Paralela

1. **Redução de 57% no tempo** (28 semanas → 12 semanas)
2. **Mínimos conflitos de merge** (diretórios isolados)
3. **Sprints curtos** (2 semanas) com entregas incrementais
4. **Checkpoints frequentes** para validação
5. **Rollback fácil** se algo der errado

### 🔀 Pontos de Sincronização

| Sprint | Semana | Merge | Componentes |
|--------|--------|-------|-------------|
| Sprint 1 | 2 | Track 1 → main | Interface + SES refatorado |
| Sprint 2 | 4 | **TODOS** → main | Postal + Webhooks + DKIM |
| Sprint 3 | 6 | **TODOS** → main | IP Pools + Supressão + DNS |
| Sprint 4 | 8 | **BIG MERGE** 🔥 | Integração completa - MVP READY |
| Sprint 5 | 10 | **TODOS** → main | Features avançadas |
| Sprint 6 | 11 | Final → main | Deploy prep |
| Sprint 7 | 12 | 🚀 | **PRODUÇÃO** |

---

## 🚀 GUIA DE INÍCIO RÁPIDO POR DESENVOLVEDOR

### 📋 Person A - Track 1 (Drivers & Infraestrutura)

**Primeira Semana:**
1. Criar branch `track-1-drivers` a partir de `feature/esp-selfhosted`
2. Criar estrutura de diretórios:
   ```bash
   mkdir -p apps/worker/src/drivers/{base,aws-ses,postal}
   mkdir -p apps/api/src/modules/{ip-pool,provider,rate-limit}
   ```
3. Criar interface `IEmailDriver` em `drivers/base/email-driver.interface.ts`
4. Refatorar `SESService` para nova estrutura
5. **Checkpoint:** SES funcionando sem quebrar nada

**Arquivos Principais:**
- `apps/worker/src/drivers/base/email-driver.interface.ts`
- `apps/worker/src/drivers/driver-factory.ts`
- `apps/worker/src/services/email-driver.service.ts`

**Testes Críticos:**
- [ ] Envio via SES continua funcionando 100%
- [ ] Interface aceita múltiplos drivers
- [ ] Factory consegue instanciar drivers

---

### 📋 Person B - Track 2 (Webhooks & Processamento)

**Primeira Semana:**
1. Criar branch `track-2-webhooks` a partir de `feature/esp-selfhosted`
2. Criar estrutura de diretórios:
   ```bash
   mkdir -p apps/worker/src/services
   mkdir -p apps/worker/src/types
   mkdir -p apps/api/src/modules/{webhook,suppression,tracking,reputation}
   ```
3. Estudar RFCs: RFC 3464 (DSN) e RFC 5965 (ARF)
4. Implementar parsers de DSN e ARF
5. **Checkpoint:** Parsers testados com payloads reais

**Arquivos Principais:**
- `apps/worker/src/services/dsn-parser.service.ts`
- `apps/worker/src/services/arf-parser.service.ts`
- `apps/worker/src/services/bounce-classifier.service.ts`

**Testes Críticos:**
- [ ] Parser DSN identifica bounce type corretamente
- [ ] Parser ARF extrai complaint info
- [ ] Classificador diferencia hard/soft bounce

---

### 📋 Person C - Track 3 (Domínios & Frontend)

**Primeira Semana:**
1. Criar branch `track-3-domains` a partir de `feature/esp-selfhosted`
2. Criar estrutura de diretórios:
   ```bash
   mkdir -p apps/api/src/modules/onboarding
   mkdir -p apps/dashboard/src/pages/{domains,reputation,metrics}
   mkdir -p packages/shared/src/crypto
   ```
3. Estudar DKIM (RFC 6376) e geração de chaves RSA
4. Implementar gerador de DKIM
5. **Checkpoint:** Par de chaves DKIM gerado com sucesso

**Arquivos Principais:**
- `apps/api/src/modules/onboarding/dkim-generator.service.ts`
- `apps/api/src/modules/onboarding/onboarding.controller.ts`
- `packages/shared/src/crypto/dkim-crypto.ts`

**Testes Críticos:**
- [ ] Gera par RSA 2048-bit válido
- [ ] Formata chave pública para DNS TXT
- [ ] Encripta chave privada para storage

---

## 🏁 Fase 0: Preparação (TODOS - 1 semana)

### Setup Inicial (Tech Lead)
- [ ] Criar branch `feature/esp-selfhosted`
- [ ] Criar sub-branches: `track-1-drivers`, `track-2-webhooks`, `track-3-domains`
- [ ] Configurar ambiente de desenvolvimento com Postal/Mailu
- [ ] Definir feature flags e estratégia de merge
- [ ] Documentar arquitetura e divisão de responsabilidades

### Migrations (Tech Lead + Person A)
- [ ] Criar todas as migrations do banco de dados
- [ ] Aplicar migrations em dev
- [ ] Validar schemas

**🎯 Checkpoint:** Branches criadas, ambiente configurado, banco atualizado

---

## 👤 TRACK 1: INFRAESTRUTURA & DRIVERS
**Responsável:** Person A (Dev Backend Sênior)  
**Branch:** `track-1-drivers`  
**Foco:** Sistema de drivers, providers, IP pools, rate limiting

### Semana 1-2: Abstração Base
```
📂 Arquivos a criar/modificar:
apps/worker/src/
├── drivers/
│   ├── base/
│   │   ├── email-driver.interface.ts       ✨ NOVO
│   │   ├── email-driver-result.ts          ✨ NOVO
│   │   └── driver-config.types.ts          ✨ NOVO
│   └── driver-factory.ts                    ✨ NOVO
└── services/
    └── email-driver.service.ts              ✨ NOVO

apps/worker/src/services/
├── ses.service.ts                           ♻️ REFATORAR → drivers/aws-ses/ses-driver.ts
```

**Tasks:**
- [ ] Criar interface `IEmailDriver` base
- [ ] Criar tipos `SendResult`, `DriverConfig`
- [ ] Implementar `DriverFactory`
- [ ] Refatorar `SESService` → `SESDriver` (mantém funcionalidade 100%)
- [ ] Criar `EmailDriverService` (orquestrador)
- [ ] Mover SES para `drivers/aws-ses/ses-driver.ts`
- [ ] Adicionar toggle `EMAIL_PROVIDER` no env
- [ ] Testes unitários
- [ ] **Checkpoint:** SES funcionando via nova arquitetura

### Semana 3-4: Driver Postal SMTP
```
📂 Arquivos a criar:
apps/worker/src/drivers/postal/
├── postal-smtp-driver.ts                    ✨ NOVO
├── postal-config.ts                         ✨ NOVO
└── return-path-generator.ts                 ✨ NOVO

docker-compose.yml                           ♻️ ADICIONAR postal service
```

**Tasks:**
- [ ] Implementar `PostalSMTPDriver` (interface `IEmailDriver`)
- [ ] Configurar Postal no docker-compose
- [ ] Implementar Return-Path dedicado (`bounce+hash@bounce.cliente.com`)
- [ ] Implementar List-Unsubscribe headers (mailto + https)
- [ ] Testes de envio real
- [ ] **Checkpoint:** Envios via Postal SMTP funcionando

### Semana 5-6: IP Pools & Rate Limiting
```
📂 Arquivos a criar:
apps/api/src/modules/ip-pool/
├── ip-pool.controller.ts                    ✨ NOVO
├── ip-pool.service.ts                       ✨ NOVO
└── dto/
    ├── create-ip-pool.dto.ts                ✨ NOVO
    └── ip-pool-response.dto.ts              ✨ NOVO

apps/worker/src/services/
├── ip-pool-selector.service.ts              ✨ NOVO
└── mx-rate-limiter.service.ts               ✨ NOVO

apps/api/src/modules/rate-limit/
├── rate-limit.controller.ts                 ✨ NOVO
└── rate-limit.service.ts                    ✨ NOVO
```

**Tasks:**
- [ ] Criar CRUD de IP Pools (API)
- [ ] Implementar `IPPoolSelectorService` (seleciona IP por tipo)
- [ ] Implementar `MXRateLimiterService` (Redis sliding window)
- [ ] Configurar limites: Gmail (20/s), Outlook (10/s), Yahoo (5/s)
- [ ] Integrar com drivers de envio
- [ ] Dashboard básico de métricas
- [ ] **Checkpoint:** Rate limiting por MX funcional

### Semana 7-8: Providers & Fallback
```
📂 Arquivos a criar:
apps/api/src/modules/provider/
├── provider.controller.ts                   ✨ NOVO
├── provider.service.ts                      ✨ NOVO
└── dto/

packages/shared/src/types/
└── email-provider.types.ts                  ✨ NOVO
```

**Tasks:**
- [ ] Criar CRUD de Email Providers (tabela `email_providers`)
- [ ] Implementar sistema de prioridade
- [ ] Implementar fallback automático (SES → Postal)
- [ ] Testes de failover
- [ ] **Checkpoint:** Multi-provider com fallback

### Semana 9: Drivers Adicionais (Opcional)
```
📂 Arquivos a criar:
apps/worker/src/drivers/
├── postal/postal-api-driver.ts              ✨ NOVO
├── mailu/mailu-smtp-driver.ts               ✨ NOVO
└── haraka/haraka-api-driver.ts              ✨ NOVO
```

**Tasks:**
- [ ] Implementar `PostalAPIDriver`
- [ ] Implementar `MailuSMTPDriver`
- [ ] Implementar `HarakaAPIDriver`
- [ ] Testes de integração
- [ ] **Checkpoint:** Múltiplos drivers funcionando

---

## 👤 TRACK 2: WEBHOOKS & PROCESSAMENTO
**Responsável:** Person B (Dev Backend Pleno/Sênior)  
**Branch:** `track-2-webhooks`  
**Foco:** Webhooks, parsers, supressão, reputação, tracking

### Semana 1-2: Parsers DSN/ARF
```
📂 Arquivos a criar:
apps/worker/src/services/
├── dsn-parser.service.ts                    ✨ NOVO
├── arf-parser.service.ts                    ✨ NOVO
└── bounce-classifier.service.ts             ✨ NOVO

apps/worker/src/types/
├── dsn-report.types.ts                      ✨ NOVO
└── arf-report.types.ts                      ✨ NOVO
```

**Tasks:**
- [ ] Implementar `DSNParserService` (RFC 3464)
- [ ] Implementar `ARFParserService` (RFC 5965)
- [ ] Implementar classificador de bounces (hard/soft/transient)
- [ ] Testes com payloads reais
- [ ] **Checkpoint:** Parsers funcionando

### Semana 3-4: Webhooks Postal
```
📂 Arquivos a criar:
apps/api/src/modules/webhook/
├── postal-webhook.controller.ts             ✨ NOVO
├── postal-webhook-validator.service.ts      ✨ NOVO
└── webhook-signature.service.ts             ✨ NOVO

apps/worker/src/
├── webhook-ingest-worker.ts                 ✨ NOVO
└── services/
    └── webhook-event-processor.service.ts   ✨ NOVO
```

**Tasks:**
- [ ] Criar `PostalWebhookController` (recebe webhooks)
- [ ] Implementar validação de signature (HMAC)
- [ ] Criar worker de processamento (`webhook-ingest-worker`)
- [ ] Processar eventos: bounce, complaint, delivery, open, click
- [ ] Integrar com parsers DSN/ARF
- [ ] Atualizar `email_logs` com eventos
- [ ] **Checkpoint:** Webhooks Postal processados

### Semana 5-6: Sistema de Supressão
```
📂 Arquivos a criar:
apps/api/src/modules/suppression/
├── suppression.controller.ts                ✨ NOVO
├── suppression.service.ts                   ✨ NOVO
├── suppression-import.service.ts            ✨ NOVO
└── dto/
    ├── add-suppression.dto.ts               ✨ NOVO
    ├── check-suppression.dto.ts             ✨ NOVO
    └── import-suppression.dto.ts            ✨ NOVO

apps/worker/src/services/
└── auto-suppression.service.ts              ✨ NOVO
```

**Tasks:**
- [ ] Migrar dados `recipient_blocklist` → `suppressions`
- [ ] Criar CRUD de Suppressions (API)
- [ ] Implementar supressão global (companyId = null)
- [ ] Implementar detecção de role accounts (admin@, info@, etc)
- [ ] Implementar importação em massa (CSV)
- [ ] Endpoint `POST /suppressions/check`
- [ ] Integrar com `email-send.service.ts` (bloquear antes de enviar)
- [ ] Auto-adicionar em hard bounce + complaint
- [ ] **Checkpoint:** Sistema de supressão completo

### Semana 7-8: Reputação & Guardrails
```
📂 Arquivos a criar:
apps/worker/src/services/
├── reputation-monitor.service.ts            ✨ NOVO (ou ♻️ expandir existente)
├── reputation-calculator.service.ts         ✨ NOVO
└── guardrails.service.ts                    ✨ NOVO

apps/worker/src/
└── reputation-calculator-worker.ts          ✨ NOVO

apps/api/src/modules/reputation/
├── reputation.controller.ts                 ✨ NOVO
└── reputation.service.ts                    ✨ NOVO
```

**Tasks:**
- [ ] Implementar `ReputationCalculatorService`
- [ ] Criar worker de cálculo diário de métricas
- [ ] Implementar `GuardrailsService`
  - Pausar se bounce ≥ 2%
  - Pausar se complaint ≥ 0.1%
- [ ] Criar alertas automáticos (email, webhook, Slack)
- [ ] Dashboard de reputação (endpoint API)
- [ ] Salvar em `reputation_metrics` (daily)
- [ ] **Checkpoint:** Monitoramento e guardrails ativos

### Semana 9-10: Tracking (Opens/Clicks)
```
📂 Arquivos a criar:
apps/api/src/modules/tracking/
├── tracking.controller.ts                   ✨ NOVO
├── tracking.service.ts                      ✨ NOVO
├── pixel-generator.service.ts               ✨ NOVO
└── link-rewriter.service.ts                 ✨ NOVO

apps/worker/src/services/
└── html-tracking-injector.service.ts        ✨ NOVO
```

**Tasks:**
- [ ] Implementar pixel de abertura (1x1 transparente)
- [ ] Implementar rewrite de links (tracking de cliques)
- [ ] Endpoint `GET /track/open/:trackingId`
- [ ] Endpoint `GET /track/click/:trackingId/:linkId`
- [ ] Injetar tracking no HTML (worker)
- [ ] Salvar eventos em `email_tracking`
- [ ] Dashboard de engajamento (API)
- [ ] **Checkpoint:** Tracking completo

### Semana 11: Warm-up Scheduler
```
📂 Arquivos a criar:
apps/worker/src/services/
└── warmup-scheduler.service.ts              ✨ NOVO

apps/api/src/modules/domain/
└── warmup-config.service.ts                 ✨ NOVO (ou integrar em domain.service.ts)
```

**Tasks:**
- [ ] Implementar `WarmupSchedulerService`
- [ ] Calcular limite diário baseado em warmup schedule
- [ ] Escalonar: Dia 1 (50), Dia 2 (100), Dia 3 (200)...
- [ ] Frear envios se limite diário atingido
- [ ] Rollback se métricas ruins
- [ ] **Checkpoint:** Warm-up automático

---

## 👤 TRACK 3: DOMÍNIOS & ONBOARDING
**Responsável:** Person C (Dev Full-Stack)  
**Branch:** `track-3-domains`  
**Foco:** DNS, DKIM, onboarding automático, dashboard

### Semana 1-2: DKIM Generator
```
📂 Arquivos a criar:
apps/api/src/modules/onboarding/
├── onboarding.module.ts                     ✨ NOVO
├── onboarding.controller.ts                 ✨ NOVO
├── onboarding.service.ts                    ✨ NOVO
├── dkim-generator.service.ts                ✨ NOVO
└── dto/
    ├── start-onboarding.dto.ts              ✨ NOVO
    └── onboarding-response.dto.ts           ✨ NOVO

packages/shared/src/crypto/
└── dkim-crypto.ts                           ✨ NOVO
```

**Tasks:**
- [ ] Implementar `DKIMGeneratorService`
- [ ] Gerar par RSA 2048-bit
- [ ] Gerar selector (ex: `s20251030`)
- [ ] Formatar chave pública para DNS TXT
- [ ] Encriptar chave privada (storage seguro)
- [ ] Endpoint `POST /domains/:id/onboarding/generate-dkim`
- [ ] Salvar em `domain_onboarding`
- [ ] **Checkpoint:** DKIM gerado automaticamente

### Semana 3-4: DNS Verification
```
📂 Arquivos a criar:
apps/api/src/modules/onboarding/
├── dns-verifier.service.ts                  ✨ NOVO
└── dns-checker.service.ts                   ✨ NOVO

apps/worker/src/
├── dns-verification-worker.ts               ✨ NOVO
└── services/
    └── dns-lookup.service.ts                ✨ NOVO
```

**Tasks:**
- [ ] Implementar `DNSVerifierService`
- [ ] Implementar `DNSLookupService` (wrapper do `dns` do Node.js)
- [ ] Verificar DKIM: `<selector>._domainkey.<domain>` (TXT)
- [ ] Verificar SPF: `<domain>` (TXT, começa com `v=spf1`)
- [ ] Verificar Return-Path: `bounce.<domain>` (CNAME ou A)
- [ ] Criar worker de verificação automática (a cada 1h)
- [ ] Endpoint `POST /domains/:id/onboarding/verify`
- [ ] Atualizar status em `domain_onboarding`
- [ ] **Checkpoint:** DNS verificado automaticamente

### Semana 5-6: Onboarding Checklist
```
📂 Arquivos a criar:
apps/api/src/modules/onboarding/
├── checklist-generator.service.ts           ✨ NOVO
└── production-readiness.service.ts          ✨ NOVO

apps/dashboard/src/pages/
└── domains/
    ├── DomainOnboarding.tsx                 ✨ NOVO (Frontend)
    └── OnboardingChecklist.tsx              ✨ NOVO (Frontend)
```

**Tasks:**
- [ ] Implementar `ChecklistGeneratorService`
- [ ] Gerar checklist completo:
  - ✅ DKIM gerado
  - ✅ DKIM publicado no DNS
  - ✅ SPF configurado
  - ✅ Return-Path configurado
  - ✅ Domínio verificado
- [ ] Endpoint `GET /domains/:id/onboarding/checklist`
- [ ] Endpoint `POST /domains/:id/onboarding/start`
- [ ] Auto-marcar `PRODUCTION_READY` quando tudo OK
- [ ] Criar UI do checklist (React)
- [ ] **Checkpoint:** Onboarding visual funcionando

### Semana 7-8: Dashboard de Reputação
```
📂 Arquivos a criar:
apps/api/src/modules/reputation/
└── reputation-dashboard.service.ts          ✨ NOVO (ou integrar em reputation.service)

apps/dashboard/src/pages/
├── reputation/
│   ├── ReputationDashboard.tsx              ✨ NOVO (Frontend)
│   ├── DomainReputation.tsx                 ✨ NOVO (Frontend)
│   └── MetricsChart.tsx                     ✨ NOVO (Frontend)
└── metrics/
    └── EmailMetricsDashboard.tsx            ✨ NOVO (Frontend)
```

**Tasks:**
- [ ] Endpoint `GET /reputation` (empresa)
- [ ] Endpoint `GET /reputation/domain/:id` (por domínio)
- [ ] Endpoint `GET /metrics/dashboard` (consolidado)
- [ ] Criar dashboard React com gráficos:
  - Taxa de bounce (últimos 7 dias)
  - Taxa de complaint (últimos 7 dias)
  - Taxa de abertura
  - Taxa de cliques
  - Reputação score
- [ ] Alertas visuais se guardrails ativados
- [ ] **Checkpoint:** Dashboard completo

### Semana 9-10: DNS Records Management
```
📂 Arquivos a criar:
apps/api/src/modules/domain/
├── dns-records.controller.ts                ✨ NOVO
└── dns-records.service.ts                   ✨ NOVO

apps/dashboard/src/pages/domains/
└── DNSRecordsManager.tsx                    ✨ NOVO (Frontend)
```

**Tasks:**
- [ ] CRUD de DNS Records (tabela `dns_records`)
- [ ] Endpoint `GET /domains/:id/dns-records`
- [ ] Endpoint `POST /domains/:id/dns-records` (adicionar manual)
- [ ] Auto-gerar records esperados no onboarding
- [ ] UI para copiar records (copy to clipboard)
- [ ] Status visual (✅ verificado, ⏳ pendente, ❌ falhou)
- [ ] **Checkpoint:** Gestão de DNS completa

### Semana 11: Postmaster Ingest (Opcional)
```
📂 Arquivos a criar:
apps/worker/src/services/
├── gmail-postmaster.service.ts              ✨ NOVO
├── ms-snds.service.ts                       ✨ NOVO
└── dmarc-parser.service.ts                  ✨ NOVO

apps/api/src/modules/reputation/
└── postmaster.controller.ts                 ✨ NOVO
```

**Tasks:**
- [ ] Integração Gmail Postmaster API
- [ ] Integração MS SNDS API
- [ ] Parser de DMARC reports (rua=)
- [ ] Endpoint `GET /reputation/postmaster`
- [ ] Dashboard com métricas externas
- [ ] **Checkpoint:** Ingest de postmaster

---

## 🔀 PONTOS DE SINCRONIZAÇÃO (Merge Points)

### Sprint 1 (Semana 2)
**Merge:** Track 1 → `main`
- ✅ Interface base de drivers
- ✅ SES refatorado para nova arquitetura
- ✅ Migrations aplicadas

**Dependências:**
- Track 2 aguarda: Interface `IEmailDriver`
- Track 3: Independente

---

### Sprint 2 (Semana 4)
**Merge:** Track 1 → `main`
- ✅ Postal SMTP driver funcionando
- ✅ Docker-compose atualizado

**Merge:** Track 2 → `main`
- ✅ Parsers DSN/ARF
- ✅ Webhooks Postal

**Merge:** Track 3 → `main`
- ✅ DKIM Generator

**Dependências:**
- Track 2 pode testar webhooks com Postal do Track 1
- Track 3 independente

---

### Sprint 3 (Semana 6)
**Merge:** Track 1 → `main`
- ✅ IP Pools
- ✅ Rate Limiting

**Merge:** Track 2 → `main`
- ✅ Sistema de Supressão

**Merge:** Track 3 → `main`
- ✅ DNS Verification

**Dependências:**
- Track 1 IP Pools podem ser usados por Track 2 Reputação

---

### Sprint 4 (Semana 8)
**Merge:** TODOS → `main` (Big Merge)
- ✅ Providers & Fallback (Track 1)
- ✅ Reputação & Guardrails (Track 2)
- ✅ Onboarding Checklist (Track 3)

**Testes de Integração:**
- [ ] Envio end-to-end com todos componentes
- [ ] Webhooks processando e afetando reputação
- [ ] Onboarding completo com verificação DNS

---

### Sprint 5 (Semana 10)
**Merge:** TODOS → `main`
- ✅ Drivers adicionais (Track 1)
- ✅ Tracking opens/clicks (Track 2)
- ✅ Dashboard completo (Track 3)

---

### Sprint 6 (Semana 11)
**Merge:** Final → `main`
- ✅ Warm-up scheduler (Track 2)
- ✅ Postmaster ingest (Track 3 - opcional)

**Testes Finais:**
- [ ] Testes end-to-end completos
- [ ] Testes de carga
- [ ] Testes de failover
- [ ] Documentação completa

---

### Sprint 7 (Semana 12)
**Deploy:**
- [ ] Deploy em staging
- [ ] Testes com clientes beta
- [ ] Deploy em produção (gradual)

---

## 📋 QUADRO DE DEPENDÊNCIAS

| Track | Depende de | Pode ser usado por |
|-------|------------|-------------------|
| Track 1 (Drivers) | Migrations | Track 2 (webhooks precisam saber provider)<br>Track 3 (onboarding precisa saber qual MTA) |
| Track 2 (Webhooks) | Track 1 (interface driver)<br>Migrations | Track 3 (reputação afeta onboarding) |
| Track 3 (Domains) | Migrations | Track 1 (drivers usam domínios verificados)<br>Track 2 (reputação por domínio) |

---

## 🔧 ESTRATÉGIA DE MERGE

### Regra de Ouro
**Cada track trabalha em diretórios distintos:**

```
Track 1 (Person A):
  apps/worker/src/drivers/
  apps/api/src/modules/ip-pool/
  apps/api/src/modules/provider/
  apps/api/src/modules/rate-limit/

Track 2 (Person B):
  apps/worker/src/services/ (parsers, reputation, suppression)
  apps/worker/src/*-worker.ts (novos workers)
  apps/api/src/modules/webhook/
  apps/api/src/modules/suppression/
  apps/api/src/modules/tracking/

Track 3 (Person C):
  apps/api/src/modules/onboarding/
  apps/api/src/modules/domain/ (expansão)
  apps/dashboard/src/pages/ (frontend)
```

### Arquivos Compartilhados (CUIDADO!)

**⚠️ Conflito Potencial:**
```
packages/shared/src/types/           # Todos criam types
packages/database/prisma/schema.prisma  # Migrations
apps/api/src/app.module.ts          # Registrar novos modules
```

**Solução:**
- **Types:** Cada track cria em namespace próprio
  - `packages/shared/src/types/drivers/`
  - `packages/shared/src/types/webhooks/`
  - `packages/shared/src/types/onboarding/`
- **Prisma:** Migrations já aplicadas na Fase 0
- **app.module.ts:** Merge manual cuidadoso (imports simples)

---

## 📊 CRONOGRAMA VISUAL

```
Semana │ Person A (Track 1)        │ Person B (Track 2)        │ Person C (Track 3)
───────┼──────────────────────────┼──────────────────────────┼─────────────────────────
  1-2  │ Interface + SES Refactor │ Parsers DSN/ARF          │ DKIM Generator
       │ ✅ Checkpoint: SES novo   │                          │
───────┼──────────────────────────┼──────────────────────────┼─────────────────────────
  3-4  │ Postal SMTP Driver       │ Webhooks Postal          │ DNS Verification
       │ ✅ Checkpoint: Postal OK  │ ✅ Checkpoint: Webhooks  │ ✅ Checkpoint: DNS OK
───────┼──────────────────────────┼──────────────────────────┼─────────────────────────
       │          🔀 MERGE SPRINT 2 (Person A + B + C)
───────┼──────────────────────────┼──────────────────────────┼─────────────────────────
  5-6  │ IP Pools + Rate Limit    │ Supressão Avançada       │ Onboarding Checklist
       │ ✅ Checkpoint: Rate Limit │ ✅ Checkpoint: Suppression│ ✅ Checkpoint: Checklist
───────┼──────────────────────────┼──────────────────────────┼─────────────────────────
  7-8  │ Providers + Fallback     │ Reputação + Guardrails   │ Dashboard Reputação
       │ ✅ Checkpoint: Multi-prov │ ✅ Checkpoint: Guardrails│ ✅ Checkpoint: Dashboard
───────┼──────────────────────────┼──────────────────────────┼─────────────────────────
       │          🔀 BIG MERGE SPRINT 4 (Integração Total)
───────┼──────────────────────────┼──────────────────────────┼─────────────────────────
  9-10 │ Drivers Adicionais       │ Tracking Opens/Clicks    │ DNS Records Manager
       │ (Postal API, Mailu, etc) │ ✅ Checkpoint: Tracking  │ ✅ Checkpoint: DNS UI
───────┼──────────────────────────┼──────────────────────────┼─────────────────────────
  11   │ Testes + Docs            │ Warm-up Scheduler        │ Postmaster Ingest (opt)
       │                          │ ✅ Checkpoint: Warmup    │
───────┼──────────────────────────┼──────────────────────────┼─────────────────────────
  12   │          🚀 DEPLOY STAGING + PRODUÇÃO
───────┴──────────────────────────┴──────────────────────────┴─────────────────────────
```

---

## 📊 7. ESTIMATIVA DE ESFORÇO - MODELO PARALELO

### Modelo Sequencial (1 pessoa)
| Fase | Duração | Complexidade | Prioridade |
|------|---------|--------------|------------|
| 0. Preparação | 1 semana | Baixa | Alta |
| 1. Abstração SES | 2 semanas | Alta | **CRÍTICA** |
| 2. Driver Postal SMTP | 2 semanas | Média | Alta |
| 3. Webhooks & Parsers | 2 semanas | Alta | Alta |
| 4. IP Pools & Rate Limiting | 2 semanas | Alta | Alta |
| 5. Supressão Avançada | 1 semana | Média | Alta |
| 6. Onboarding de Domínios | 3 semanas | Alta | Alta |
| 7. Métricas & Reputação | 2 semanas | Alta | Alta |
| 8. Warm-up Automático | 1 semana | Média | Média |
| 9. Tracking | 2 semanas | Média | Média |
| 10. Drivers Adicionais | 6 semanas | Média | Baixa |
| 11. Postmaster Ingest | 2 semanas | Baixa | Baixa |
| 12. Testes & Deploy | 2 semanas | Alta | **CRÍTICA** |

**Total Sequencial:** 28-30 semanas (~6-7 meses) - 1 pessoa

---

### Modelo Paralelo (3 pessoas) ⚡
| Sprint | Semanas | Track 1 | Track 2 | Track 3 | Status |
|--------|---------|---------|---------|---------|--------|
| Sprint 0 | 1 | Preparação | Preparação | Preparação | Setup |
| Sprint 1 | 2 | Interface + SES | Parsers DSN/ARF | DKIM Gen | 🔀 Merge |
| Sprint 2 | 2 | Postal SMTP | Webhooks | DNS Verify | 🔀 Merge |
| Sprint 3 | 2 | IP Pools | Supressão | Onboarding | 🔀 Merge |
| Sprint 4 | 2 | Providers | Reputação | Dashboard | 🔀 **BIG MERGE** |
| Sprint 5 | 2 | Drivers Extras | Tracking | DNS UI | 🔀 Merge |
| Sprint 6 | 1 | Testes | Warm-up | Postmaster | 🔀 Final |
| Sprint 7 | 1 | Deploy | Deploy | Deploy | 🚀 Produção |

**Total Paralelo:** **12 semanas (~3 meses)** - 3 pessoas

**Ganho de Tempo:** 
- Sequencial: 28 semanas
- Paralelo: 12 semanas
- **Redução: 57% de tempo** 🎯

---

### Alocação de Recursos

#### Person A (Track 1) - Backend Sênior
**Horas Estimadas:** 480h (12 semanas × 40h)
- Semana 1-2: Interface & SES (80h)
- Semana 3-4: Postal SMTP (80h)
- Semana 5-6: IP Pools & Rate Limit (80h)
- Semana 7-8: Providers & Fallback (80h)
- Semana 9-10: Drivers Adicionais (80h)
- Semana 11-12: Testes & Deploy (80h)

#### Person B (Track 2) - Backend Pleno/Sênior
**Horas Estimadas:** 480h (12 semanas × 40h)
- Semana 1-2: Parsers DSN/ARF (80h)
- Semana 3-4: Webhooks Postal (80h)
- Semana 5-6: Supressão (80h)
- Semana 7-8: Reputação & Guardrails (80h)
- Semana 9-10: Tracking (80h)
- Semana 11-12: Warm-up & Deploy (80h)

#### Person C (Track 3) - Full-Stack
**Horas Estimadas:** 480h (12 semanas × 40h)
- Semana 1-2: DKIM Generator (80h)
- Semana 3-4: DNS Verification (80h)
- Semana 5-6: Onboarding Checklist (80h)
- Semana 7-8: Dashboard Reputação (80h)
- Semana 9-10: DNS UI (80h)
- Semana 11-12: Postmaster & Deploy (80h)

**Total Pessoa/Hora:** 1.440 horas  
**Custo Estimado (Brasil):** R$ 216.000 - R$ 360.000 (média R$ 150-250/h)

---

### MVP vs Completo

#### MVP Funcional (Sprint 1-4 → 8 semanas)
**Entregas:**
- ✅ AWS SES como toggle
- ✅ Driver Postal SMTP
- ✅ Webhooks (bounce, complaint, delivery)
- ✅ IP Pools & Rate Limiting
- ✅ Sistema de Supressão
- ✅ Onboarding de Domínios (DKIM, SPF, DNS)
- ✅ Reputação & Guardrails
- ✅ Dashboard básico

**Status:** **Sistema Produção-Ready** 🚀

#### Fase 2 (Sprint 5-7 → +4 semanas)
**Entregas:**
- ✅ Drivers adicionais (Mailu, Haraka)
- ✅ Tracking (opens/clicks)
- ✅ Warm-up automático
- ✅ Dashboard avançado
- ✅ Postmaster ingest (opcional)

**Status:** ESP Completo de Nível Enterprise 🏆

---

### Comparativo com Mercado

| Solução | Tempo | Custo | Features |
|---------|-------|-------|----------|
| **Nosso ESP** | 12 semanas | R$ 216-360k | 100% customizado |
| SendGrid Enterprise | - | $3.000-10.000/mês | Vendor lock-in |
| Mailgun | - | $800-3.000/mês | Limitações API |
| AWS SES + Setup | 4 semanas | R$ 50k + uso | Básico |
| Postal Self-Hosted | 8 semanas | R$ 150k | Sem IP pools |

**ROI:** 
- Break-even em ~6 meses vs SendGrid Enterprise
- Controle total sobre infraestrutura
- Sem limites de API/volume

---

## 🚨 8. RISCOS E MITIGAÇÕES

### Risco 1: Perda de Emails Durante Migração
**Mitigação:**
- Implementar feature flags para rollback instantâneo
- Manter SES como fallback automático
- Testes extensivos em staging antes de produção

### Risco 2: Reputação de IP Baixa no Início
**Mitigação:**
- Warm-up automático obrigatório
- Começar com volumes baixos
- Monitoramento 24/7 nos primeiros 30 dias

### Risco 3: Complexidade de DNS
**Mitigação:**
- Onboarding guiado com checklist visual
- Verificação automática em tempo real
- Suporte dedicado para clientes

### Risco 4: Rate Limiting Muito Agressivo
**Mitigação:**
- Configurações ajustáveis por cliente
- Retry inteligente com backoff
- Monitoramento de taxa de rejeição

### Risco 5: Webhooks de Providers Diferentes
**Mitigação:**
- Parsers robustos para cada provider
- Testes com payloads reais
- Fallback para processamento manual

---

## 📝 9. VARIÁVEIS DE AMBIENTE NOVAS

```bash
# Provider Configuration
EMAIL_PROVIDER=AWS_SES                     # AWS_SES, POSTAL_SMTP, POSTAL_API, MAILU_SMTP, HARAKA_API
EMAIL_PROVIDER_FALLBACK=true              # Enable fallback to SES

# Postal Configuration
POSTAL_SMTP_HOST=postal.example.com
POSTAL_SMTP_PORT=25
POSTAL_SMTP_USER=gateway@example.com
POSTAL_SMTP_PASS=secret
POSTAL_API_KEY=api_key_here
POSTAL_WEBHOOK_SECRET=webhook_secret

# Mailu Configuration
MAILU_SMTP_HOST=mailu.example.com
MAILU_SMTP_PORT=587
MAILU_SMTP_USER=gateway@example.com
MAILU_SMTP_PASS=secret

# Haraka Configuration
HARAKA_API_URL=http://haraka.example.com
HARAKA_API_KEY=api_key_here

# IP Pools
IP_POOL_TRANSACTIONAL=192.168.1.10,192.168.1.11
IP_POOL_MARKETING=192.168.1.20,192.168.1.21

# Rate Limits
RATE_LIMIT_GMAIL_PER_SECOND=20
RATE_LIMIT_OUTLOOK_PER_SECOND=10
RATE_LIMIT_YAHOO_PER_SECOND=5
RATE_LIMIT_DEFAULT_PER_SECOND=1

# Tracking
TRACKING_DOMAIN=track.certshift.com
TRACKING_PIXEL_ENABLED=true
TRACKING_CLICKS_ENABLED=true

# Reputation Monitoring
REPUTATION_CHECK_INTERVAL=3600000         # 1 hora
REPUTATION_BOUNCE_THRESHOLD=0.02          # 2%
REPUTATION_COMPLAINT_THRESHOLD=0.001      # 0.1%
REPUTATION_AUTO_PAUSE=true

# Warm-up
WARMUP_ENABLED=true
WARMUP_START_VOLUME=50
WARMUP_DAILY_INCREASE=1.5                 # 50% de aumento por dia
WARMUP_MAX_DAYS=30

# Postmaster (Opcional)
GMAIL_POSTMASTER_ENABLED=false
GMAIL_POSTMASTER_DOMAIN=certshift.com
MS_SNDS_ENABLED=false
DMARC_RUA_EMAIL=dmarc@certshift.com
```

---

## 🔧 10. CONFIGURAÇÃO DOCKER-COMPOSE

### Adicionar ao `docker-compose.yml`:

```yaml
services:
  # ... serviços existentes ...
  
  # Postal MTA (Self-hosted ESP)
  postal:
    image: ghcr.io/postalserver/postal:latest
    container_name: postal
    ports:
      - "25:25"     # SMTP
      - "587:587"   # SMTP Submission
      - "5000:5000" # Web UI
    environment:
      - POSTAL_DB_HOST=postgres
      - POSTAL_DB_NAME=postal
      - POSTAL_DB_USER=postal
      - POSTAL_DB_PASS=postal_password
      - POSTAL_REDIS_HOST=redis
    volumes:
      - postal_data:/opt/postal
      - ./postal-config:/config
    depends_on:
      - postgres
      - redis
    networks:
      - email-gateway-network
  
  # DNS Verification Worker
  dns-verification-worker:
    build:
      context: ./apps/worker
      dockerfile: Dockerfile.dns-worker
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    depends_on:
      - redis
      - postgres
    networks:
      - email-gateway-network
  
  # Reputation Calculator Worker
  reputation-worker:
    build:
      context: ./apps/worker
      dockerfile: Dockerfile.reputation-worker
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    depends_on:
      - redis
      - postgres
    networks:
      - email-gateway-network

volumes:
  postal_data:
```

---

## 📚 11. DOCUMENTAÇÃO A CRIAR

- [ ] `docs/drivers/DRIVER-INTERFACE.md` - Interface base de drivers
- [ ] `docs/drivers/AWS-SES-DRIVER.md` - Documentação do driver SES
- [ ] `docs/drivers/POSTAL-DRIVER.md` - Documentação do driver Postal
- [ ] `docs/drivers/MAILU-DRIVER.md` - Documentação do driver Mailu
- [ ] `docs/drivers/HARAKA-DRIVER.md` - Documentação do driver Haraka
- [ ] `docs/webhooks/POSTAL-WEBHOOKS.md` - Webhook format Postal
- [ ] `docs/webhooks/DSN-PARSER.md` - DSN (RFC 3464) parsing
- [ ] `docs/webhooks/ARF-PARSER.md` - ARF (RFC 5965) parsing
- [ ] `docs/onboarding/DOMAIN-ONBOARDING.md` - Processo de onboarding
- [ ] `docs/onboarding/DKIM-GENERATION.md` - Geração de DKIM
- [ ] `docs/onboarding/DNS-VERIFICATION.md` - Verificação automática DNS
- [ ] `docs/reputation/GUARDRAILS.md` - Sistema de guardrails
- [ ] `docs/reputation/WARMUP.md` - Warm-up automático
- [ ] `docs/tracking/OPENS-CLICKS.md` - Sistema de tracking
- [ ] `docs/rate-limiting/MX-RATE-LIMITS.md` - Rate limits por MX
- [ ] `docs/ip-pools/IP-POOL-MANAGEMENT.md` - Gestão de IP pools
- [ ] `docs/suppression/SUPPRESSION-LISTS.md` - Listas de supressão
- [ ] `docs/migration/MIGRATION-GUIDE.md` - Guia de migração para clientes

---

## ✅ 12. CHECKLIST DE VALIDAÇÃO

### Funcional
- [ ] Envio via AWS SES funciona (toggle ON)
- [ ] Envio via Postal SMTP funciona (toggle ON)
- [ ] Envio via Postal API funciona
- [ ] Fallback SES → Postal funciona
- [ ] Bounces detectados e processados
- [ ] Complaints detectados e processados
- [ ] Suppressions aplicadas corretamente
- [ ] Rate limiting por MX funciona
- [ ] IP pools selecionados corretamente
- [ ] Return-Path dedicado gerado
- [ ] DKIM gerado e assinado
- [ ] DNS verificado automaticamente
- [ ] Warm-up respeitado
- [ ] Guardrails pausam envio quando necessário
- [ ] Tracking de opens funciona
- [ ] Tracking de clicks funciona

### Performance
- [ ] Latência de envio < 500ms
- [ ] Throughput de 1000+ emails/minuto
- [ ] Retry funciona sem perda de dados
- [ ] Queue não acumula backlog
- [ ] Redis não sobrecarrega
- [ ] PostgreSQL otimizado

### Segurança
- [ ] Chaves privadas DKIM encriptadas
- [ ] Webhooks validados (HMAC)
- [ ] Secrets em vault (não em env)
- [ ] TLS em todas conexões SMTP
- [ ] API keys rotacionadas

### Observabilidade
- [ ] Métricas no Prometheus
- [ ] Logs estruturados
- [ ] Alertas configurados
- [ ] Dashboard funcionando
- [ ] Tracing habilitado

---

## 🎉 13. CONCLUSÃO

Este plano mapeia **todas as mudanças necessárias** para transformar o `email-gateway` em um **ESP self-hosted completo** com todas as funcionalidades de um serviço profissional de envio de emails.

### Principais Entregáveis

1. **Multi-Provider**: Suporte a AWS SES, Postal, Mailu, Haraka
2. **IP Pools**: Gestão de múltiplos IPs (transacional, marketing, dedicado)
3. **Rate Limiting**: Inteligente por MX (Gmail, Outlook, Yahoo)
4. **Webhooks**: Processamento completo de bounces, complaints, opens, clicks
5. **Supressão**: Sistema avançado com listas globais e por tenant
6. **Onboarding**: Automação completa de DNS (DKIM, SPF, Return-Path)
7. **Reputação**: Monitoramento em tempo real com guardrails automáticos
8. **Warm-up**: Escalamento gradual automático
9. **Tracking**: Opens e clicks com métricas detalhadas
10. **Postmaster**: Ingest de dados de Gmail Postmaster e MS SNDS (opcional)

### Próximos Passos

1. **Revisar** este documento com o time técnico
2. **Aprovar** escopo e prioridades
3. **Iniciar Fase 0** (Preparação)
4. **Implementar Fase 1** (Abstração SES) - **CRÍTICO**
5. **Iterar** pelas fases seguintes

---

---

## 🛠️ COMANDOS ÚTEIS POR TRACK

### Track 1 (Person A) - Comandos

```bash
# Setup inicial
git checkout -b track-1-drivers feature/esp-selfhosted
mkdir -p apps/worker/src/drivers/{base,aws-ses,postal,mailu,haraka}
mkdir -p apps/api/src/modules/{ip-pool,provider,rate-limit}

# Rodar worker isolado
cd apps/worker
npm run dev

# Testes
npm test -- drivers/
npm test -- services/email-driver.service

# Build
npm run build

# Testar envio SES
curl -X POST http://localhost:3000/v1/email/send \
  -H "X-API-Key: your-key" \
  -d '{"to":"test@example.com","subject":"Test","html":"<p>Test</p>"}'
```

### Track 2 (Person B) - Comandos

```bash
# Setup inicial
git checkout -b track-2-webhooks feature/esp-selfhosted
mkdir -p apps/worker/src/services
mkdir -p apps/api/src/modules/{webhook,suppression,tracking,reputation}

# Testar parsers
npm test -- services/dsn-parser
npm test -- services/arf-parser

# Simular webhook Postal
curl -X POST http://localhost:3000/webhooks/postal \
  -H "Content-Type: application/json" \
  -d @test-payloads/bounce.json

# Verificar supressão
curl http://localhost:3000/v1/suppressions?email=blocked@example.com

# Rodar worker de reputação
cd apps/worker
npm run worker:reputation
```

### Track 3 (Person C) - Comandos

```bash
# Setup inicial
git checkout -b track-3-domains feature/esp-selfhosted
mkdir -p apps/api/src/modules/onboarding
mkdir -p apps/dashboard/src/pages/{domains,reputation,metrics}

# Gerar DKIM
curl -X POST http://localhost:3000/v1/domains/:id/onboarding/generate-dkim

# Verificar DNS
curl http://localhost:3000/v1/domains/:id/onboarding/verify

# Rodar dashboard
cd apps/dashboard
npm run dev

# Build frontend
npm run build
```

---

## 📚 REFERÊNCIAS TÉCNICAS

### RFCs Importantes
- **RFC 3464** - Delivery Status Notifications (DSN)
- **RFC 5965** - Abuse Reporting Format (ARF)
- **RFC 6376** - DomainKeys Identified Mail (DKIM)
- **RFC 7208** - Sender Policy Framework (SPF)
- **RFC 7489** - Domain-based Message Authentication (DMARC)

### Documentação de Providers
- **Postal**: https://docs.postalserver.io/
- **Mailu**: https://mailu.io/master/
- **Haraka**: https://haraka.github.io/
- **AWS SES**: https://docs.aws.amazon.com/ses/

### Ferramentas de Teste
- **DNS Checker**: https://dnschecker.org/
- **DKIM Validator**: https://dkimvalidator.com/
- **SPF Checker**: https://www.kitterman.com/spf/validate.html
- **MX Toolbox**: https://mxtoolbox.com/

### Rate Limits por Provider
| Provider | Per Second | Per Minute | Notes |
|----------|-----------|------------|-------|
| Gmail | 20 | 1,000 | Mais restritivo |
| Outlook | 10 | 500 | Moderado |
| Yahoo | 5 | 250 | Conservador |
| Default | 1 | 50 | Seguro |

---

## 🎓 LEARNING PATH SUGERIDO

### Week 0 - Preparação
- [ ] Ler documentação de drivers existente
- [ ] Estudar código do `SESService` atual
- [ ] Entender fluxo: API → Queue → Worker → SES
- [ ] Configurar ambiente local

### Week 1-2 - Fundamentos
- [ ] **Track 1:** Entender padrão Factory e Strategy
- [ ] **Track 2:** Ler RFCs 3464 e 5965
- [ ] **Track 3:** Estudar DKIM e geração de chaves RSA

### Week 3-4 - Implementação Core
- [ ] Foco em testes unitários
- [ ] Code review entre tracks
- [ ] Primeira integração (Sprint 2)

### Week 5-8 - Features Avançadas
- [ ] Integração contínua
- [ ] Testes de carga
- [ ] Performance tuning

### Week 9-12 - Finalização
- [ ] Testes end-to-end
- [ ] Documentação
- [ ] Deploy staging → produção

---

## 📞 COMUNICAÇÃO ENTRE TRACKS

### Daily Sync (15 min)
**Horário:** 10:00 AM (diário)  
**Formato:** Cada pessoa responde:
1. O que fiz ontem?
2. O que vou fazer hoje?
3. Algum bloqueio?
4. Preciso de ajuda de outro track?

### Sprint Planning (2h)
**Frequência:** A cada 2 semanas  
**Objetivo:** Planejar próximo sprint  
**Participantes:** Todos + Tech Lead

### Sprint Review (1h)
**Frequência:** Final de cada sprint  
**Objetivo:** Demo + feedback  
**Participantes:** Todos + stakeholders

### Merge Review (30min)
**Frequência:** Antes de cada merge point  
**Objetivo:** Validar integração  
**Participantes:** Todos

### Canais de Comunicação
- **Slack #esp-selfhosted**: Dúvidas gerais
- **Slack #esp-track-1**: Person A
- **Slack #esp-track-2**: Person B
- **Slack #esp-track-3**: Person C
- **GitHub PRs**: Code review
- **Notion/Docs**: Documentação

---

## ⚠️ REGRAS DE OURO

### ✅ SEMPRE
1. **Testar** antes de fazer PR
2. **Documentar** decisões importantes
3. **Comunicar** bloqueios imediatamente
4. **Code review** antes de merge
5. **Backup** antes de migrations
6. **Feature flags** para rollback fácil

### ❌ NUNCA
1. **Commitar** código que quebra build
2. **Merge** sem aprovação de 2 pessoas
3. **Deploy** sem testes
4. **Modificar** arquivos de outro track sem avisar
5. **Deletar** migrations antigas
6. **Hard-code** credenciais

---

**Documento preparado por:** Análise Técnica Completa  
**Data:** 30 de Outubro de 2025  
**Versão:** 2.0 - 3 Tracks Paralelas  
**Status:** 📋 Pronto para Execução

---

### Anexos

- **Diagramas de Arquitetura**: `docs/architecture/ESP-ARCHITECTURE.md` (a criar)
- **ERD do Banco de Dados**: `docs/database/ESP-ERD.md` (a criar)
- **Fluxogramas**: `docs/flows/ESP-FLOWS.md` (a criar)
- **Guide Person A**: `docs/tracks/TRACK-1-GUIDE.md` (a criar)
- **Guide Person B**: `docs/tracks/TRACK-2-GUIDE.md` (a criar)
- **Guide Person C**: `docs/tracks/TRACK-3-GUIDE.md` (a criar)

