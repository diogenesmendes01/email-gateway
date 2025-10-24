# TASK-016 — Implementar Domain Warm-up Logic (Feature)

## Contexto
- Origem: Análise completa do código (domain-management.service.ts:368)
- Resumo: Configuração de warm-up existe no banco, mas lógica de aplicação de limites graduais não está implementada. TODO encontrado

## O que precisa ser feito
- [ ] Implementar lógica de aumento gradual de volume por dia
- [ ] Calcular limite diário baseado no dia do warm-up
- [ ] Integrar com worker para respeitar limites de warm-up
- [ ] Adicionar endpoint para ver progresso do warm-up
- [ ] Logs de progresso do warm-up
- [ ] Testes da lógica de warm-up

## Urgência
- **Nível (1–5):** 4 (NICE TO HAVE - Feature)

## Responsável sugerido
- Backend

## Dependências / Riscos
- Dependências:
  - Model Domain já tem campos de warm-up
  - Worker precisa consultar limites
- Riscos:
  - Baixo: Feature opcional
  - Warm-up manual também funciona

## Detalhes Técnicos

**Estratégia de Warm-up (baseada em best practices SES):**

```
Dia 1:  50 emails
Dia 2:  100 emails
Dia 3:  200 emails
Dia 4:  500 emails
Dia 5:  1000 emails
Dia 6:  2000 emails
Dia 7:  5000 emails
Dia 8:  10000 emails
Dia 9:  20000 emails
Dia 10: 50000 emails
Dia 11+: Sem limite (warm-up completo)
```

**Implementar:** `apps/worker/src/services/domain-management.service.ts`

```typescript
interface WarmupConfig {
  enabled: boolean;
  startDate: Date;
  currentDay: number;
  dailyLimit: number;
  sentToday: number;
}

@Injectable()
export class DomainManagementService {
  private readonly logger = new Logger(DomainManagementService.name);

  // Warm-up schedule (emails per day)
  private readonly WARMUP_SCHEDULE: number[] = [
    50,    // Day 1
    100,   // Day 2
    200,   // Day 3
    500,   // Day 4
    1000,  // Day 5
    2000,  // Day 6
    5000,  // Day 7
    10000, // Day 8
    20000, // Day 9
    50000, // Day 10
  ];

  /**
   * Get warm-up configuration for a domain
   */
  async getWarmupConfig(domain: string): Promise<WarmupConfig | null> {
    const domainRecord = await this.prisma.domain.findUnique({
      where: { domain },
    });

    if (!domainRecord || !domainRecord.warmupEnabled) {
      return null;
    }

    const startDate = domainRecord.warmupStartDate;
    if (!startDate) {
      return null;
    }

    // Calculate current day of warm-up
    const daysSinceStart = this.getDaysSince(startDate);
    const currentDay = daysSinceStart + 1; // Day 1-indexed

    // Get daily limit for current day
    const dailyLimit = this.getDailyLimit(currentDay);

    // Count emails sent today for this domain
    const sentToday = await this.getEmailsSentToday(domain);

    return {
      enabled: true,
      startDate,
      currentDay,
      dailyLimit,
      sentToday,
    };
  }

  /**
   * Calculate days since a date
   */
  private getDaysSince(date: Date): number {
    const now = new Date();
    const start = new Date(date);

    // Reset time to midnight for accurate day calculation
    start.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);

    const diffTime = now.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  }

  /**
   * Get daily sending limit for a given warm-up day
   */
  private getDailyLimit(day: number): number {
    if (day <= 0) {
      return 0;
    }

    if (day > this.WARMUP_SCHEDULE.length) {
      // Warm-up completed, no limit
      return Infinity;
    }

    return this.WARMUP_SCHEDULE[day - 1];
  }

  /**
   * Count emails sent today for a domain
   */
  private async getEmailsSentToday(domain: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Extract domain from from_address
    const count = await this.prisma.emailOutbox.count({
      where: {
        fromAddress: {
          endsWith: `@${domain}`,
        },
        status: EmailStatus.SENT,
        sentAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    return count;
  }

  /**
   * Check if domain can send email (respecting warm-up limits)
   */
  async canSendEmail(domain: string): Promise<{
    allowed: boolean;
    reason?: string;
    warmupInfo?: WarmupConfig;
  }> {
    const warmupConfig = await this.getWarmupConfig(domain);

    if (!warmupConfig) {
      // No warm-up active, always allowed
      return { allowed: true };
    }

    if (warmupConfig.sentToday >= warmupConfig.dailyLimit) {
      return {
        allowed: false,
        reason: `Daily warm-up limit reached (${warmupConfig.dailyLimit} emails). Try again tomorrow.`,
        warmupInfo: warmupConfig,
      };
    }

    return {
      allowed: true,
      warmupInfo: warmupConfig,
    };
  }

  /**
   * Configure warm-up for a domain
   */
  async configureWarmup(domain: string, enable: boolean): Promise<void> {
    const domainRecord = await this.prisma.domain.findUnique({
      where: { domain },
    });

    if (!domainRecord) {
      throw new Error(`Domain ${domain} not found`);
    }

    const data: any = {
      warmupEnabled: enable,
    };

    if (enable && !domainRecord.warmupStartDate) {
      // Starting new warm-up
      data.warmupStartDate = new Date();

      this.logger.log({
        message: 'Domain warm-up started',
        domain,
        startDate: data.warmupStartDate,
      });
    } else if (!enable) {
      // Stopping warm-up
      data.warmupStartDate = null;

      this.logger.log({
        message: 'Domain warm-up stopped',
        domain,
      });
    }

    await this.prisma.domain.update({
      where: { domain },
      data,
    });
  }

  /**
   * Get warm-up progress for dashboard
   */
  async getWarmupProgress(domain: string): Promise<{
    enabled: boolean;
    currentDay: number;
    totalDays: number;
    todayLimit: number;
    todaySent: number;
    todayRemaining: number;
    percentComplete: number;
    isComplete: boolean;
  } | null> {
    const warmupConfig = await this.getWarmupConfig(domain);

    if (!warmupConfig) {
      return null;
    }

    const totalDays = this.WARMUP_SCHEDULE.length;
    const isComplete = warmupConfig.currentDay > totalDays;
    const percentComplete = Math.min(
      100,
      (warmupConfig.currentDay / totalDays) * 100
    );

    return {
      enabled: warmupConfig.enabled,
      currentDay: warmupConfig.currentDay,
      totalDays,
      todayLimit: warmupConfig.dailyLimit,
      todaySent: warmupConfig.sentToday,
      todayRemaining: Math.max(0, warmupConfig.dailyLimit - warmupConfig.sentToday),
      percentComplete: Math.round(percentComplete),
      isComplete,
    };
  }
}
```

**Integrar no Worker:**

```typescript
// apps/worker/src/processors/email.processor.ts
@Processor('email:send')
export class EmailProcessor {

  async process(job: Job<EmailJobData>) {
    const { fromAddress } = job.data;
    const domain = this.extractDomain(fromAddress);

    // Check warm-up limits
    const canSend = await this.domainManagementService.canSendEmail(domain);

    if (!canSend.allowed) {
      this.logger.warn({
        message: 'Email blocked by warm-up limit',
        domain,
        reason: canSend.reason,
        warmupInfo: canSend.warmupInfo,
      });

      // Reschedule for tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      throw new Error(
        `Warm-up limit reached. Scheduled for retry at ${tomorrow.toISOString()}`
      );
    }

    // Log warm-up progress
    if (canSend.warmupInfo) {
      this.logger.debug({
        message: 'Warm-up active',
        domain,
        day: canSend.warmupInfo.currentDay,
        sent: canSend.warmupInfo.sentToday,
        limit: canSend.warmupInfo.dailyLimit,
      });
    }

    // Proceed with sending
    await this.sesService.sendEmail(job.data);
  }

  private extractDomain(email: string): string {
    return email.split('@')[1];
  }
}
```

**Endpoints:**

```typescript
// apps/api/src/modules/domain/domain.controller.ts

@Get(':domain/warmup')
async getWarmupProgress(@Param('domain') domain: string) {
  return this.domainManagementService.getWarmupProgress(domain);
}

@Post(':domain/warmup')
async configureWarmup(
  @Param('domain') domain: string,
  @Body() dto: { enabled: boolean }
) {
  await this.domainManagementService.configureWarmup(domain, dto.enabled);
  return { message: 'Warm-up configuration updated' };
}
```

**Resposta da API:**

```json
{
  "enabled": true,
  "currentDay": 5,
  "totalDays": 10,
  "todayLimit": 1000,
  "todaySent": 487,
  "todayRemaining": 513,
  "percentComplete": 50,
  "isComplete": false
}
```

**Testes:**

```typescript
describe('Domain Warm-up Logic', () => {
  it('should calculate correct day of warm-up', () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 3); // 3 days ago

    const daysSince = service['getDaysSince'](startDate);
    expect(daysSince).toBe(3);
  });

  it('should return correct daily limit for day 1', () => {
    const limit = service['getDailyLimit'](1);
    expect(limit).toBe(50);
  });

  it('should return Infinity after warm-up complete', () => {
    const limit = service['getDailyLimit'](11);
    expect(limit).toBe(Infinity);
  });

  it('should block sending when daily limit reached', async () => {
    // Mock: Domain já enviou 1000 emails hoje (limite do dia 5)
    jest.spyOn(service as any, 'getEmailsSentToday').mockResolvedValue(1000);
    jest.spyOn(service as any, 'getDailyLimit').mockReturnValue(1000);

    const result = await service.canSendEmail('example.com');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily warm-up limit reached');
  });

  it('should allow sending when under limit', async () => {
    jest.spyOn(service as any, 'getEmailsSentToday').mockResolvedValue(500);
    jest.spyOn(service as any, 'getDailyLimit').mockReturnValue(1000);

    const result = await service.canSendEmail('example.com');

    expect(result.allowed).toBe(true);
    expect(result.warmupInfo.todayRemaining).toBe(500);
  });
});
```

## Categoria
**Feature - Domain Management**

## Bloqueador para Produção?
**NÃO** - Feature nice-to-have. Warm-up pode ser feito manualmente. Útil para produção mas não essencial para MVP.
