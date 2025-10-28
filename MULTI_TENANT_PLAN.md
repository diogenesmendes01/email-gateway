# Plano de Implementação Multi-Tenant com Proteções

**Data:** 2025-01-20
**Objetivo:** Transformar o Email Gateway em sistema multi-tenant seguro com domínios personalizados e proteções rigorosas

---

## Índice
1. [Status Atual](#status-atual)
2. [O Que Já Existe](#o-que-já-existe)
3. [O Que Precisa Ser Implementado](#o-que-precisa-ser-implementado)
4. [Plano de Execução](#plano-de-execução)
5. [Detalhamento Técnico](#detalhamento-técnico)

---

## Status Atual

### Arquitetura
- **Modelo:** Multi-tenant básico (cada empresa tem API Key)
- **Envio:** Todos os emails saem do mesmo endereço (SES_FROM_ADDRESS)
- **Limites:** Rate limit por segundo (RPS), sem limite diário
- **Proteções:** Básicas (blocklist, circuit breaker)
- **Curadoria:** Não existe (qualquer um pode criar conta)

### Problema
- Cliente A envia spam → afeta reputação da conta AWS inteira → afeta Cliente B
- Não há isolamento de reputação
- Não há limites diários por cliente
- Não há aprovação de novos clientes

---

## O Que Já Existe

### ✅ Infraestrutura Pronta

#### 1. Multi-tenant Base
- **Tabela:** `Company` com isolamento por `companyId`
- **Autenticação:** Sistema de API Keys com bcrypt
- **Rate Limit:** `rateLimitConfig` (JSON) mas é RPS, não diário

#### 2. Sistema de Domínios
- **Tabela:** `Domain` com campos para verificação
- **Service:** `DomainManagementService` (`apps/worker/src/services/domain-management.service.ts`)
  - Verificação DNS/DKIM via AWS SES API
  - Suporte a SPF, DKIM, DMARC
- **Campos warm-up:** `warmupEnabled`, `warmupConfig`, `warmupStartDate`

#### 3. Proteções Existentes
- **Blocklist:** Tabela `RecipientBlocklist` (TASK-024)
  - Bloqueia emails com hard bounce
  - Bloqueia emails com complaint (spam)
- **Event Processor:** `SESEventProcessorService` (`apps/worker/src/services/ses-event-processor.service.ts`)
  - Processa bounces do AWS SES
  - Processa complaints do AWS SES
  - Processa deliveries
- **Circuit Breaker:** Implementado em `ses.service.ts`
  - Abre após 70% de erros
  - Timeout de 35s
- **Webhook System:** TASK-023 completo
  - Recebe notificações do AWS SNS
  - Enfileira para processamento

#### 4. Batch System
- **Tabela:** `EmailBatch` (TASK-025)
- **API:** `POST /v1/email/batch` (até 1000 emails)
- **API:** `POST /v1/email/batch/csv` (upload CSV)
- **Controller:** `batch-email.controller.ts`

#### 5. Dashboard
- **Páginas:** KPIs, Emails, Error Breakdown
- **Auth:** Login com username/password
- **Componentes:** Formulário de envio individual

---

## O Que Precisa Ser Implementado

### 🚧 Fase 1: Multi-tenant com Domínios Personalizados

#### 1.1 Schema - Adicionar campos na Company

**Arquivo:** `packages/database/prisma/schema.prisma`

```prisma
model Company {
  // ... campos existentes (id, name, apiKey, etc.)

  // ===== NOVOS CAMPOS: Domínio personalizado =====
  defaultFromAddress String?  @map("default_from_address") @db.VarChar(254)
  defaultFromName    String?  @map("default_from_name") @db.VarChar(100)
  domainId           String?  @map("domain_id") // FK para Domain padrão

  // ===== NOVOS CAMPOS: Limites =====
  dailyEmailLimit    Int      @default(1000) @map("daily_email_limit")
  monthlyEmailLimit  Int?     @map("monthly_email_limit")

  // ===== NOVOS CAMPOS: Curadoria e Status =====
  isApproved         Boolean  @default(false) @map("is_approved")
  isSuspended        Boolean  @default(false) @map("is_suspended")
  suspensionReason   String?  @map("suspension_reason") @db.Text
  approvedAt         DateTime? @map("approved_at")
  approvedBy         String?  @map("approved_by") @db.VarChar(128)

  // ===== NOVOS CAMPOS: Métricas (cache) =====
  bounceRate         Float    @default(0) @map("bounce_rate")
  complaintRate      Float    @default(0) @map("complaint_rate")
  lastMetricsUpdate  DateTime? @map("last_metrics_update")

  // Relations (adicionar):
  domain            Domain?   @relation("CompanyDefaultDomain", fields: [domainId], references: [id])

  @@index([isApproved, isSuspended])
  @@index([bounceRate])
  @@index([complaintRate])
}

model Domain {
  // ... campos existentes

  // Adicionar relation:
  defaultForCompanies Company[] @relation("CompanyDefaultDomain")
}
```

**Comandos:**
```bash
npx prisma migrate dev --name add_company_multi_tenant_fields
npx prisma generate
```

#### 1.2 Worker - Usar domínio da empresa

**Arquivo:** `apps/worker/src/services/ses.service.ts`

**Modificação na linha 133-145:**

```typescript
private async sendEmailInternal(
  jobData: EmailSendJobData,
  htmlContent: string,
): Promise<SESSendResult> {
  try {
    // NOVO: Buscar configuração da empresa
    const company = await prisma.company.findUnique({
      where: { id: jobData.companyId },
      include: { domain: true },
    });

    if (!company) {
      throw new Error(`Company ${jobData.companyId} not found`);
    }

    // NOVO: Determinar fromAddress
    let fromAddress = this.config.fromAddress; // fallback global
    let fromName: string | undefined;

    if (company.defaultFromAddress) {
      // Validar se domínio está verificado
      if (company.domain?.status === 'VERIFIED') {
        fromAddress = company.defaultFromAddress;
        fromName = company.defaultFromName || undefined;
      } else {
        console.warn(`Company ${company.id} domain not verified, using global address`);
      }
    }

    // Formatar Source com nome (opcional)
    const source = fromName
      ? `${fromName} <${fromAddress}>`
      : fromAddress;

    const command = new SendEmailCommand({
      Source: source, // MODIFICADO: era this.config.fromAddress
      Destination: {
        ToAddresses: [jobData.to],
        // ...
      },
      // ... resto
    });

    // ... resto do código
  }
}
```

#### 1.3 API - Gerenciamento de Domínios

**Novo módulo:** `apps/api/src/modules/domain/`

**Estrutura:**
```
domain/
├── domain.module.ts
├── domain.controller.ts
├── domain.service.ts
└── dto/
    ├── create-domain.dto.ts
    └── domain-response.dto.ts
```

**Endpoints:**

```typescript
// domain.controller.ts

@Controller('v1/company/domains')
@ApiKeyOnly()
export class DomainController {

  // POST /v1/company/domains
  // Adicionar novo domínio
  @Post()
  async createDomain(
    @Body() dto: CreateDomainDto,
    @Request() req: any
  ): Promise<DomainResponseDto> {
    const companyId = req.user.companyId;

    // 1. Chamar AWS SES para iniciar verificação
    // 2. Salvar no banco com status PENDING
    // 3. Retornar tokens DNS para o cliente
  }

  // GET /v1/company/domains
  // Listar domínios da empresa
  @Get()
  async listDomains(@Request() req: any): Promise<DomainResponseDto[]> {
    const companyId = req.user.companyId;
    return this.domainService.findByCompany(companyId);
  }

  // GET /v1/company/domains/:id/dns
  // Obter tokens DNS para configuração
  @Get(':id/dns')
  async getDNSRecords(
    @Param('id') domainId: string,
    @Request() req: any
  ): Promise<DNSRecordsResponseDto> {
    // Retornar DKIM tokens, SPF, DMARC
  }

  // POST /v1/company/domains/:id/verify
  // Forçar verificação (consultar AWS)
  @Post(':id/verify')
  async verifyDomain(
    @Param('id') domainId: string,
    @Request() req: any
  ): Promise<DomainResponseDto> {
    // Chamar DomainManagementService.verifyDomainStatus()
    // Atualizar status no banco
  }

  // PATCH /v1/company/domains/:id/default
  // Definir como domínio padrão
  @Patch(':id/default')
  async setDefault(
    @Param('id') domainId: string,
    @Request() req: any
  ): Promise<void> {
    const companyId = req.user.companyId;
    // Atualizar Company.domainId
  }

  // DELETE /v1/company/domains/:id
  // Remover domínio
  @Delete(':id')
  async deleteDomain(
    @Param('id') domainId: string,
    @Request() req: any
  ): Promise<void> {
    // Validar que não é o domínio padrão
    // Remover do banco
    // Opcional: remover do AWS SES
  }
}
```

---

### 🚧 Fase 2: Proteções Pesadas

#### 2.1 Daily Quota Service

**Arquivo:** `apps/api/src/modules/email/services/daily-quota.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { prisma } from '@email-gateway/database';

@Injectable()
export class DailyQuotaService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
  }

  /**
   * Verifica se empresa tem quota disponível
   */
  async checkQuota(companyId: string): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    resetsAt: Date;
  }> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { dailyEmailLimit: true, isSuspended: true },
    });

    if (!company) {
      throw new Error(`Company ${companyId} not found`);
    }

    if (company.isSuspended) {
      return {
        allowed: false,
        current: 0,
        limit: company.dailyEmailLimit,
        resetsAt: this.getNextReset(),
      };
    }

    // Redis key: quota:company:{id}:2025-01-20
    const today = this.getDateKey();
    const key = `quota:company:${companyId}:${today}`;

    const current = await this.redis.get(key);
    const currentCount = current ? parseInt(current, 10) : 0;

    return {
      allowed: currentCount < company.dailyEmailLimit,
      current: currentCount,
      limit: company.dailyEmailLimit,
      resetsAt: this.getNextReset(),
    };
  }

  /**
   * Incrementa contador de quota
   */
  async incrementQuota(companyId: string, count: number = 1): Promise<void> {
    const today = this.getDateKey();
    const key = `quota:company:${companyId}:${today}`;

    await this.redis.multi()
      .incr(key, count)
      .expire(key, 86400) // 24 horas
      .exec();
  }

  /**
   * Obter data atual (YYYY-MM-DD)
   */
  private getDateKey(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * Obter horário do próximo reset (meia-noite UTC)
   */
  private getNextReset(): Date {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    return tomorrow;
  }
}
```

**Integração no EmailSendService:**

```typescript
// apps/api/src/modules/email/services/email-send.service.ts

async sendEmail(companyId: string, dto: EmailSendDto): Promise<EmailSendResponse> {
  // NOVO: Verificar quota ANTES de enfileirar
  const quota = await this.dailyQuotaService.checkQuota(companyId);

  if (!quota.allowed) {
    throw new BadRequestException({
      code: 'DAILY_QUOTA_EXCEEDED',
      message: `Daily email limit exceeded (${quota.current}/${quota.limit}). Resets at ${quota.resetsAt}`,
      limit: quota.limit,
      current: quota.current,
      resetsAt: quota.resetsAt,
    });
  }

  // ... resto do código (criar recipient, enfileirar, etc.)

  // NOVO: Incrementar contador após enfileirar
  await this.dailyQuotaService.incrementQuota(companyId);

  return { ... };
}
```

#### 2.2 Reputation Monitor Service

**Arquivo:** `apps/api/src/modules/monitoring/reputation-monitor.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { prisma } from '@email-gateway/database';

@Injectable()
export class ReputationMonitorService {
  private readonly logger = new Logger(ReputationMonitorService.name);

  /**
   * Calcular taxas de bounce e complaint dos últimos 7 dias
   */
  async calculateRates(companyId: string): Promise<{
    bounceRate: number;
    complaintRate: number;
    totalSent: number;
    totalBounces: number;
    totalComplaints: number;
  }> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Contar emails enviados (SENT status)
    const totalSent = await prisma.emailLog.count({
      where: {
        companyId,
        status: 'SENT',
        sentAt: { gte: sevenDaysAgo },
      },
    });

    // Contar bounces (hard bounces)
    const totalBounces = await prisma.emailLog.count({
      where: {
        companyId,
        bounceType: { in: ['Permanent'] },
        createdAt: { gte: sevenDaysAgo },
      },
    });

    // Contar complaints
    const totalComplaints = await prisma.emailLog.count({
      where: {
        companyId,
        complaintFeedbackType: { not: null },
        createdAt: { gte: sevenDaysAgo },
      },
    });

    const bounceRate = totalSent > 0 ? (totalBounces / totalSent) * 100 : 0;
    const complaintRate = totalSent > 0 ? (totalComplaints / totalSent) * 100 : 0;

    return {
      bounceRate,
      complaintRate,
      totalSent,
      totalBounces,
      totalComplaints,
    };
  }

  /**
   * Verificar e suspender empresas com métricas ruins
   */
  async checkAndSuspend(companyId: string): Promise<void> {
    const rates = await this.calculateRates(companyId);

    // Atualizar cache no banco
    await prisma.company.update({
      where: { id: companyId },
      data: {
        bounceRate: rates.bounceRate,
        complaintRate: rates.complaintRate,
        lastMetricsUpdate: new Date(),
      },
    });

    // Thresholds (AWS SES suspende em: bounce > 10%, complaint > 0.5%)
    // Usamos mais rigoroso para proteger a conta
    const BOUNCE_THRESHOLD = 5; // 5%
    const COMPLAINT_THRESHOLD = 0.1; // 0.1%

    let suspensionReason: string | null = null;

    if (rates.bounceRate > BOUNCE_THRESHOLD) {
      suspensionReason = `High bounce rate: ${rates.bounceRate.toFixed(2)}% (threshold: ${BOUNCE_THRESHOLD}%)`;
    }

    if (rates.complaintRate > COMPLAINT_THRESHOLD) {
      suspensionReason = `High complaint rate: ${rates.complaintRate.toFixed(2)}% (threshold: ${COMPLAINT_THRESHOLD}%)`;
    }

    if (suspensionReason) {
      await this.suspendCompany(companyId, suspensionReason);

      this.logger.error({
        message: 'Company suspended due to poor reputation',
        companyId,
        bounceRate: rates.bounceRate,
        complaintRate: rates.complaintRate,
        reason: suspensionReason,
      });

      // TODO: Enviar notificação (email, webhook, Slack)
    }
  }

  /**
   * Suspender empresa
   */
  private async suspendCompany(companyId: string, reason: string): Promise<void> {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        isSuspended: true,
        suspensionReason: reason,
      },
    });
  }

  /**
   * Cron job: Verificar todas as empresas ativas a cada 1 hora
   */
  @Cron(CronExpression.EVERY_HOUR)
  async monitorAllCompanies(): Promise<void> {
    this.logger.log('Running reputation monitor for all companies');

    const companies = await prisma.company.findMany({
      where: {
        isActive: true,
        isSuspended: false,
      },
      select: { id: true },
    });

    for (const company of companies) {
      try {
        await this.checkAndSuspend(company.id);
      } catch (error) {
        this.logger.error({
          message: 'Error monitoring company',
          companyId: company.id,
          error: (error as Error).message,
        });
      }
    }

    this.logger.log(`Reputation monitor completed for ${companies.length} companies`);
  }
}
```

**Ativar no módulo:**

```typescript
// apps/api/src/app.module.ts
import { ScheduleModule } from '@nestjs/schedule';
import { ReputationMonitorService } from './modules/monitoring/reputation-monitor.service';

@Module({
  imports: [
    ScheduleModule.forRoot(), // Ativar cron jobs
    // ... outros imports
  ],
  providers: [
    ReputationMonitorService,
    // ... outros providers
  ],
})
```

#### 2.3 Content Validation Service

**Arquivo:** `apps/api/src/modules/email/services/content-validation.service.ts`

```typescript
import { Injectable } from '@nestjs/common';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  score: number; // 0-100 (spam score)
}

@Injectable()
export class ContentValidationService {
  // Lista de palavras de spam (simplificada)
  private readonly SPAM_WORDS = [
    'click here', 'buy now', 'limited time', 'act now',
    'congratulations', 'you won', 'free money', 'viagra',
    'nigerian prince', 'weight loss', 'casino', 'lottery',
  ];

  // Domínios de email descartáveis
  private readonly DISPOSABLE_DOMAINS = [
    'temp-mail.com', 'guerrillamail.com', '10minutemail.com',
    'mailinator.com', 'throwaway.email', 'tempmail.com',
  ];

  /**
   * Validar email completo
   */
  async validateEmail(email: {
    to: string;
    subject: string;
    html: string;
  }): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let score = 0;

    // 1. Validar email descartável
    if (this.isDisposableEmail(email.to)) {
      errors.push(`Disposable email domain detected: ${email.to}`);
      score += 50;
    }

    // 2. Validar sintaxe HTML
    const htmlValidation = this.validateHTML(email.html);
    if (!htmlValidation.valid) {
      errors.push(...htmlValidation.errors);
      score += 10;
    }

    // 3. Detectar palavras de spam
    const spamWords = this.detectSpamWords(email.subject + ' ' + email.html);
    if (spamWords.length > 0) {
      warnings.push(`Spam words detected: ${spamWords.join(', ')}`);
      score += spamWords.length * 5;
    }

    // 4. Verificar links suspeitos
    const suspiciousLinks = this.detectSuspiciousLinks(email.html);
    if (suspiciousLinks.length > 0) {
      warnings.push(`Suspicious links: ${suspiciousLinks.length} found`);
      score += suspiciousLinks.length * 10;
    }

    // 5. Verificar proporção texto/HTML
    const textRatio = this.calculateTextRatio(email.html);
    if (textRatio < 0.1) {
      warnings.push('Very low text-to-HTML ratio (mostly images)');
      score += 15;
    }

    return {
      valid: errors.length === 0 && score < 50,
      errors,
      warnings,
      score,
    };
  }

  /**
   * Verificar se email é descartável
   */
  private isDisposableEmail(email: string): boolean {
    const domain = email.split('@')[1]?.toLowerCase();
    return this.DISPOSABLE_DOMAINS.includes(domain);
  }

  /**
   * Validar HTML básico
   */
  private validateHTML(html: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // HTML muito longo
    if (html.length > 500_000) {
      errors.push('HTML content too large (> 500KB)');
    }

    // Tags suspeitas
    if (/<script/i.test(html)) {
      errors.push('Script tags not allowed');
    }

    if (/<iframe/i.test(html)) {
      errors.push('Iframe tags not allowed');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Detectar palavras de spam
   */
  private detectSpamWords(text: string): string[] {
    const lowerText = text.toLowerCase();
    return this.SPAM_WORDS.filter(word => lowerText.includes(word));
  }

  /**
   * Detectar links suspeitos
   */
  private detectSuspiciousLinks(html: string): string[] {
    const suspicious: string[] = [];

    // Regex para extrair URLs
    const urlRegex = /href=["']([^"']+)["']/gi;
    let match;

    while ((match = urlRegex.exec(html)) !== null) {
      const url = match[1];

      // URL encurtada (bit.ly, tinyurl, etc)
      if (/bit\.ly|tinyurl|short\.link/i.test(url)) {
        suspicious.push(url);
      }

      // IP em vez de domínio
      if (/https?:\/\/\d+\.\d+\.\d+\.\d+/.test(url)) {
        suspicious.push(url);
      }
    }

    return suspicious;
  }

  /**
   * Calcular proporção texto/HTML
   */
  private calculateTextRatio(html: string): number {
    const textOnly = html.replace(/<[^>]*>/g, '').trim();
    return textOnly.length / html.length;
  }
}
```

**Integração no EmailSendService:**

```typescript
async sendEmail(companyId: string, dto: EmailSendDto): Promise<EmailSendResponse> {
  // ... verificar quota

  // NOVO: Validar conteúdo
  const validation = await this.contentValidationService.validateEmail({
    to: dto.recipient.email,
    subject: dto.subject,
    html: dto.html,
  });

  if (!validation.valid) {
    throw new BadRequestException({
      code: 'CONTENT_VALIDATION_FAILED',
      message: 'Email content failed validation',
      errors: validation.errors,
      warnings: validation.warnings,
      score: validation.score,
    });
  }

  // Logar warnings mesmo se passou
  if (validation.warnings.length > 0) {
    this.logger.warn({
      message: 'Email has validation warnings',
      companyId,
      warnings: validation.warnings,
      score: validation.score,
    });
  }

  // ... resto do código
}
```

---

### 🚧 Fase 3: Curadoria de Clientes

#### 3.1 API de Aprovação

**Arquivo:** `apps/api/src/modules/admin/admin.controller.ts`

```typescript
import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { AdminGuard } from './guards/admin.guard';

@Controller('v1/admin/companies')
@UseGuards(AdminGuard) // Requer autenticação de admin
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * Listar empresas pendentes de aprovação
   */
  @Get('pending')
  async listPending() {
    return prisma.company.findMany({
      where: {
        isApproved: false,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        // Métricas dos primeiros dias
        bounceRate: true,
        complaintRate: true,
        _count: {
          select: {
            emailOutbox: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Aprovar empresa
   */
  @Post(':id/approve')
  async approve(@Param('id') companyId: string, @Body() dto: ApproveDto) {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        isApproved: true,
        approvedAt: new Date(),
        approvedBy: dto.adminUsername,
        dailyEmailLimit: dto.dailyLimit || 10000, // Aumentar limite
      },
    });

    // TODO: Enviar email de boas-vindas

    return { success: true };
  }

  /**
   * Rejeitar empresa
   */
  @Post(':id/reject')
  async reject(@Param('id') companyId: string, @Body() dto: RejectDto) {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        isActive: false,
        suspensionReason: dto.reason,
      },
    });

    // TODO: Enviar email de rejeição

    return { success: true };
  }

  /**
   * Suspender empresa
   */
  @Post(':id/suspend')
  async suspend(@Param('id') companyId: string, @Body() dto: SuspendDto) {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        isSuspended: true,
        suspensionReason: dto.reason,
      },
    });

    return { success: true };
  }

  /**
   * Reativar empresa
   */
  @Post(':id/reactivate')
  async reactivate(@Param('id') companyId: string) {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        isSuspended: false,
        suspensionReason: null,
      },
    });

    return { success: true };
  }
}
```

#### 3.2 Sandbox Mode (Auto-aprovação)

**Service:** `apps/api/src/modules/monitoring/sandbox-monitor.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { prisma } from '@email-gateway/database';

@Injectable()
export class SandboxMonitorService {
  private readonly logger = new Logger(SandboxMonitorService.name);

  /**
   * Cron job: Verificar empresas elegíveis para auto-aprovação
   * Roda diariamente
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkAutoApproval(): Promise<void> {
    this.logger.log('Checking companies for auto-approval');

    // Critérios:
    // 1. Não aprovadas ainda
    // 2. Criadas há mais de 7 dias
    // 3. Bounce rate < 2%
    // 4. Complaint rate < 0.05%
    // 5. Enviaram pelo menos 50 emails

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

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
        _count: {
          select: {
            emailOutbox: { where: { status: 'SENT' } },
          },
        },
      },
    });

    let approvedCount = 0;

    for (const company of companies) {
      // Verificar se enviou pelo menos 50 emails
      if (company._count.emailOutbox >= 50) {
        await prisma.company.update({
          where: { id: company.id },
          data: {
            isApproved: true,
            approvedAt: new Date(),
            approvedBy: 'AUTO_APPROVAL_SYSTEM',
            dailyEmailLimit: 5000, // Aumentar limite moderadamente
          },
        });

        approvedCount++;

        this.logger.log({
          message: 'Company auto-approved',
          companyId: company.id,
          companyName: company.name,
          daysActive: Math.floor((Date.now() - company.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
          emailsSent: company._count.emailOutbox,
          bounceRate: company.bounceRate,
          complaintRate: company.complaintRate,
        });

        // TODO: Enviar email de congratulações
      }
    }

    this.logger.log(`Auto-approval completed: ${approvedCount} companies approved`);
  }
}
```

---

### 🚧 Fase 4: Dashboard UI

#### 4.1 Página de Gerenciamento de Domínios

**Arquivo:** `apps/dashboard/src/pages/DomainsPage.tsx`

```tsx
import React, { useState } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';

interface Domain {
  id: string;
  domain: string;
  status: 'PENDING' | 'VERIFIED' | 'FAILED';
  dkimStatus: 'PENDING' | 'VERIFIED' | 'FAILED';
  isDefault: boolean;
  createdAt: string;
}

export const DomainsPage: React.FC = () => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDomain, setNewDomain] = useState('');

  // Buscar domínios
  const { data: domains, isLoading, refetch } = useQuery({
    queryKey: ['domains'],
    queryFn: async () => {
      const res = await axios.get<Domain[]>('/v1/company/domains');
      return res.data;
    },
  });

  // Adicionar domínio
  const handleAddDomain = async () => {
    try {
      await axios.post('/v1/company/domains', {
        domain: newDomain,
      });

      setShowAddModal(false);
      setNewDomain('');
      refetch();
    } catch (error) {
      alert('Erro ao adicionar domínio');
    }
  };

  // Verificar domínio
  const handleVerify = async (domainId: string) => {
    try {
      await axios.post(`/v1/company/domains/${domainId}/verify`);
      refetch();
    } catch (error) {
      alert('Erro ao verificar domínio');
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Meus Domínios</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + Adicionar Domínio
        </button>
      </div>

      {isLoading ? (
        <p>Carregando...</p>
      ) : (
        <div className="space-y-4">
          {domains?.map(domain => (
            <div key={domain.id} className="border rounded-lg p-4 bg-white">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{domain.domain}</h3>
                  <div className="flex gap-2 mt-2">
                    <StatusBadge status={domain.status} label="Domínio" />
                    <StatusBadge status={domain.dkimStatus} label="DKIM" />
                    {domain.isDefault && (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                        Padrão
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleVerify(domain.id)}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                  >
                    Verificar
                  </button>
                  <button
                    onClick={() => {/* Ver DNS */}}
                    className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                  >
                    Ver DNS
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Adicionar Domínio */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96">
            <h2 className="text-xl font-bold mb-4">Adicionar Domínio</h2>
            <input
              type="text"
              placeholder="exemplo.com.br"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              className="w-full border rounded px-3 py-2 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddDomain}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Adicionar
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatusBadge: React.FC<{ status: string; label: string }> = ({ status, label }) => {
  const colors = {
    PENDING: 'bg-yellow-100 text-yellow-700',
    VERIFIED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
  };

  return (
    <span className={`px-2 py-1 text-xs rounded ${colors[status as keyof typeof colors]}`}>
      {label}: {status}
    </span>
  );
};
```

#### 4.2 Página de Envio em Massa (Tab CSV)

**Modificar:** `apps/dashboard/src/pages/SendEmailPage.tsx`

```tsx
import React, { useState } from 'react';
import axios from 'axios';

type Tab = 'individual' | 'batch';

export const SendEmailPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('individual');

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Enviar Email</h1>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        <button
          onClick={() => setActiveTab('individual')}
          className={`px-6 py-3 font-medium ${
            activeTab === 'individual'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Envio Individual
        </button>
        <button
          onClick={() => setActiveTab('batch')}
          className={`px-6 py-3 font-medium ${
            activeTab === 'batch'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Envio em Massa
        </button>
      </div>

      {/* Conteúdo */}
      {activeTab === 'individual' ? <IndividualForm /> : <BatchForm />}
    </div>
  );
};

const IndividualForm: React.FC = () => {
  // ... código atual do formulário individual
};

const BatchForm: React.FC = () => {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [preview, setPreview] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Upload e preview do CSV
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);

    // Ler primeiras 5 linhas para preview
    const text = await file.text();
    const lines = text.split('\n').slice(0, 6); // Header + 5 linhas
    const headers = lines[0].split(',');
    const rows = lines.slice(1).map(line => {
      const values = line.split(',');
      return headers.reduce((obj, header, i) => {
        obj[header.trim()] = values[i]?.trim();
        return obj;
      }, {} as any);
    });

    setPreview(rows);
  };

  // Enviar batch
  const handleSubmit = async () => {
    if (!csvFile || !subject || !html) {
      alert('Preencha todos os campos');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('subject', subject);
      formData.append('html', html);

      const res = await axios.post('/v1/email/batch/csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      alert(`Batch criado! ${res.data.totalEmails} emails enfileirados`);

      // Limpar form
      setCsvFile(null);
      setSubject('');
      setHtml('');
      setPreview([]);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Erro ao enviar batch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload CSV */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Arquivo CSV (email, nome, cpfCnpj, razaoSocial)
        </label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        <p className="text-xs text-gray-500 mt-1">
          Formato: email,nome,cpfCnpj,razaoSocial (máximo 1000 linhas)
        </p>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="border rounded p-4">
          <h3 className="font-semibold mb-2">Preview ({preview.length} primeiros)</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Email</th>
                  <th className="text-left p-2">Nome</th>
                  <th className="text-left p-2">CPF/CNPJ</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{row.email}</td>
                    <td className="p-2">{row.nome}</td>
                    <td className="p-2">{row.cpfCnpj}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assunto */}
      <div>
        <label className="block text-sm font-medium mb-2">Assunto</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Boleto Vencimento 30/10/2025"
          className="w-full border rounded px-3 py-2"
        />
      </div>

      {/* HTML */}
      <div>
        <label className="block text-sm font-medium mb-2">Conteúdo (HTML)</label>
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          rows={10}
          placeholder="<h1>Olá!</h1><p>Segue seu boleto...</p>"
          className="w-full border rounded px-3 py-2 font-mono text-sm"
        />
      </div>

      {/* Botão */}
      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={loading || !csvFile || !subject || !html}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Enviando...' : 'Enviar Batch'}
        </button>
      </div>
    </div>
  );
};
```

---

## Plano de Execução

### Sprint 1: Base Multi-tenant (2-3 dias)
**Objetivo:** Permitir que cada empresa use seu próprio domínio verificado

- [ ] **Dia 1:**
  - [ ] Criar migration com novos campos na Company
  - [ ] Modificar `ses.service.ts` para usar domínio da empresa
  - [ ] Criar módulo domain (controller + service + DTOs)

- [ ] **Dia 2:**
  - [ ] Implementar endpoints de domínio (CRUD)
  - [ ] Integrar com DomainManagementService existente
  - [ ] Testar verificação de domínio via AWS SES

- [ ] **Dia 3:**
  - [ ] Criar página DomainsPage no dashboard
  - [ ] Implementar UI para ver tokens DNS
  - [ ] Testar fluxo completo: adicionar → configurar DNS → verificar

**Entregável:** Cliente pode adicionar domínio próprio e enviar emails dele

---

### Sprint 2: Proteções (3-4 dias)
**Objetivo:** Prevenir que um cliente afete a reputação de outros

- [ ] **Dia 1:**
  - [ ] Implementar DailyQuotaService (Redis)
  - [ ] Integrar no EmailSendService
  - [ ] Testar limites por empresa

- [ ] **Dia 2:**
  - [ ] Implementar ReputationMonitorService
  - [ ] Criar cron job para calcular métricas
  - [ ] Implementar kill switch (suspensão automática)

- [ ] **Dia 3:**
  - [ ] Implementar ContentValidationService
  - [ ] Integrar validação no send flow
  - [ ] Testar detecção de spam words

- [ ] **Dia 4:**
  - [ ] Monitoramento: logs, alertas
  - [ ] Documentação das proteções
  - [ ] Testes de carga

**Entregável:** Sistema detecta e suspende automaticamente empresas problemáticas

---

### Sprint 3: Dashboard Domínios (2-3 dias)
**Objetivo:** UI completa para gerenciar domínios

- [ ] **Dia 1:**
  - [ ] Página DomainsPage (listagem + adicionar)
  - [ ] Modal para ver tokens DNS
  - [ ] Botão "Verificar" com feedback

- [ ] **Dia 2:**
  - [ ] Copiar tokens DNS (clipboard)
  - [ ] Status em tempo real (polling)
  - [ ] Documentação de como configurar DNS

- [ ] **Dia 3:**
  - [ ] Definir domínio padrão
  - [ ] Remover domínio
  - [ ] Testes E2E

**Entregável:** Cliente consegue gerenciar domínios visualmente

---

### Sprint 4: Envio em Massa (2 dias)
**Objetivo:** Permitir envio de emails em batch via CSV

- [ ] **Dia 1:**
  - [ ] Tab "Envio em Massa" no SendEmailPage
  - [ ] Upload CSV com preview
  - [ ] Validação do arquivo

- [ ] **Dia 2:**
  - [ ] Integração com API /v1/email/batch/csv
  - [ ] Feedback de progresso
  - [ ] Testes com 100+ emails

**Entregável:** Cliente pode enviar milhares de emails de uma vez

---

### Sprint 5: Curadoria (2 dias)
**Objetivo:** Aprovação manual/automática de novos clientes

- [ ] **Dia 1:**
  - [ ] AdminController (approve/reject/suspend)
  - [ ] AdminGuard (autenticação de admin)
  - [ ] SandboxMonitorService (auto-aprovação)

- [ ] **Dia 2:**
  - [ ] Admin dashboard (UI)
  - [ ] Listagem de empresas pendentes
  - [ ] Ações: aprovar, rejeitar, suspender

**Entregável:** Controle total sobre quem pode usar o sistema

---

## Detalhamento Técnico

### Arquitetura Final

```
┌─────────────────────────────────────────────────────────┐
│                      AWS SES                             │
│  (1 conta, múltiplos domínios verificados)              │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ SendEmailCommand
                     │
┌────────────────────▼────────────────────────────────────┐
│                   Worker                                 │
│  - ses.service.ts (usa domínio da Company)              │
│  - email-send.processor.ts                              │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ Redis Queue
                     │
┌────────────────────▼────────────────────────────────────┐
│                     API                                  │
│  ┌─────────────────────────────────────────────────┐   │
│  │ EmailSendService                                 │   │
│  │  1. CheckQuota (DailyQuotaService)              │   │
│  │  2. ValidateContent (ContentValidationService)  │   │
│  │  3. CheckBlacklist (RecipientBlocklist)        │   │
│  │  4. Enqueue                                     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ DomainController                                 │   │
│  │  - POST /v1/company/domains                     │   │
│  │  - GET /v1/company/domains                      │   │
│  │  - POST /v1/company/domains/:id/verify          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ AdminController                                  │   │
│  │  - GET /v1/admin/companies/pending              │   │
│  │  - POST /v1/admin/companies/:id/approve         │   │
│  │  - POST /v1/admin/companies/:id/suspend         │   │
│  └─────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
                     │
                     │ REST API
                     │
┌────────────────────▼────────────────────────────────────┐
│                  Dashboard                               │
│  - DomainsPage (gerenciar domínios)                     │
│  - SendEmailPage (individual + batch)                   │
│  - AdminPage (aprovar clientes)                         │
└──────────────────────────────────────────────────────────┘
```

### Fluxo de Envio (com todas as proteções)

```
Cliente envia POST /v1/email/send
  ↓
[1] Autenticação: API Key válida?
  ↓
[2] Status: Company está suspensa?
  ↓
[3] Quota: Limite diário atingido?
  ↓
[4] Conteúdo: Spam words? Links suspeitos?
  ↓
[5] Blocklist: Destinatário bloqueado?
  ↓
[6] Aprovação: Company aprovada? (se sandbox mode)
  ↓
[7] Enqueue: Adicionar na fila
  ↓
[8] Increment: quota:company:{id}:2025-01-20 += 1
  ↓
[Worker] Processa job
  ↓
[9] Buscar Company + Domain
  ↓
[10] Domínio verificado? Usar dele : usar global
  ↓
[11] SendEmailCommand (AWS SES)
  ↓
[12] Atualizar EmailLog
  ↓
[SNS Webhook] AWS notifica bounce/complaint
  ↓
[13] SESEventProcessor: Atualizar blocklist
  ↓
[14] ReputationMonitor (cron 1h): Calcular rates
  ↓
[15] Suspender se bounce > 5% ou complaint > 0.1%
```

### Banco de Dados (principais tabelas)

```sql
-- Company: Cliente do sistema
Company {
  id                 String
  name               String
  apiKeyHash         String

  -- Multi-tenant
  defaultFromAddress String?
  defaultFromName    String?
  domainId           String?

  -- Limites
  dailyEmailLimit    Int (default 1000)

  -- Curadoria
  isApproved         Boolean (default false)
  isSuspended        Boolean (default false)
  suspensionReason   String?

  -- Métricas
  bounceRate         Float (default 0)
  complaintRate      Float (default 0)
}

-- Domain: Domínio verificado no AWS SES
Domain {
  id              String
  companyId       String
  domain          String
  status          Enum (PENDING, VERIFIED, FAILED)
  dkimStatus      Enum
  dkimTokens      String[]

  -- Warm-up
  warmupEnabled   Boolean
  warmupConfig    Json
}

-- RecipientBlocklist: Emails bloqueados
RecipientBlocklist {
  id           String
  companyId    String
  email        String
  reason       String (hard_bounce, complaint)
  blockedAt    DateTime
}
```

### Redis (cache e quota)

```
# Quota diária por empresa
quota:company:{companyId}:2025-01-20 = 847  (TTL: 24h)

# Metrics cache (evitar queries pesadas)
metrics:company:{companyId} = {
  bounceRate: 1.2,
  complaintRate: 0.03,
  cachedAt: 1706000000
}  (TTL: 1h)
```

---

## Referências

### Thresholds AWS SES
- **Bounce rate:** AWS suspende se > 10%
  - Nosso threshold: 5% (mais rigoroso)
- **Complaint rate:** AWS suspende se > 0.5%
  - Nosso threshold: 0.1% (mais rigoroso)

### Limites Recomendados
- **Sandbox (não aprovado):** 100 emails/dia
- **Approved (básico):** 1,000 emails/dia
- **Approved (após 30 dias):** 5,000 emails/dia
- **Enterprise (negociado):** 50,000+ emails/dia

### Arquivos Importantes
- `packages/database/prisma/schema.prisma` - Schema do banco
- `apps/worker/src/services/ses.service.ts` - Envio AWS SES
- `apps/worker/src/services/domain-management.service.ts` - Gerenciamento DNS
- `apps/worker/src/services/ses-event-processor.service.ts` - Processar bounces/complaints
- `apps/api/src/modules/email/services/email-send.service.ts` - Enfileirar emails

---

## Próximos Passos

1. ✅ Revisar este documento
2. ⬜ Aprovar Sprint 1
3. ⬜ Criar branch `feature/multi-tenant-domains`
4. ⬜ Começar implementação

---

**Documento criado em:** 2025-01-20
**Última atualização:** 2025-01-20
