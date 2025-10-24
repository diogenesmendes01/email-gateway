# TASK-008 — Health Check de Quota SES (Observabilidade)

## Contexto
- Origem: PR-BACKLOG (PR11-MAJOR-02)
- Resumo: Endpoint `/health/readyz` não verifica quota disponível do SES. Sistema pode falhar silenciosamente quando quota for excedida

## O que precisa ser feito
- [ ] Adicionar chamada ao SES `GetSendQuotaCommand` no health check
- [ ] Comparar com threshold configurável (ex: 80%)
- [ ] Retornar warning se quota > 80%
- [ ] Retornar unhealthy se quota >= 100%
- [ ] Adicionar métrica `ses_quota_usage_percent`
- [ ] Adicionar alerta quando quota próxima do limite
- [ ] Documentar em runbook

## Urgência
- **Nível (1–5):** 2 (IMPORTANTE - Observabilidade)

## Responsável sugerido
- Backend

## Dependências / Riscos
- Dependências: @aws-sdk/client-ses (já instalado)
- Riscos:
  - Médio: Adiciona latência ao health check (~100-300ms)
  - Baixo: Pode causar false negatives se SES API estiver lenta
  - Mitigação: Cache de 1 minuto, timeout de 2 segundos

## Detalhes Técnicos

**Atualizar:** `apps/api/src/modules/health/health.service.ts`

```typescript
import { SESClient, GetSendQuotaCommand } from '@aws-sdk/client-ses';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface QuotaCheck {
  status: 'healthy' | 'warning' | 'unhealthy';
  usagePercent: number;
  sentLast24Hours: number;
  max24HourSend: number;
  maxSendRate: number;
  message?: string;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private sesClient: SESClient;
  private quotaCache: { data: QuotaCheck; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 60000; // 1 minuto
  private readonly QUOTA_WARNING_THRESHOLD = 0.8; // 80%
  private readonly QUOTA_CRITICAL_THRESHOLD = 0.95; // 95%

  constructor(private configService: ConfigService) {
    this.sesClient = new SESClient({
      region: this.configService.get('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async checkSESQuota(): Promise<QuotaCheck> {
    // Usar cache se disponível e válido
    if (this.quotaCache && Date.now() - this.quotaCache.timestamp < this.CACHE_TTL_MS) {
      return this.quotaCache.data;
    }

    try {
      const command = new GetSendQuotaCommand({});
      const response = await Promise.race([
        this.sesClient.send(command),
        this.timeoutPromise(2000),
      ]);

      const sentLast24Hours = response.SentLast24Hours || 0;
      const max24HourSend = response.Max24HourSend || 200; // Default sandbox limit
      const maxSendRate = response.MaxSendRate || 1;

      const usagePercent = max24HourSend > 0
        ? (sentLast24Hours / max24HourSend) * 100
        : 0;

      let status: 'healthy' | 'warning' | 'unhealthy' = 'healthy';
      let message: string | undefined;

      if (usagePercent >= this.QUOTA_CRITICAL_THRESHOLD * 100) {
        status = 'unhealthy';
        message = `SES quota critical: ${usagePercent.toFixed(1)}% used (${sentLast24Hours}/${max24HourSend} emails)`;
        this.logger.error({
          message: 'SES quota critical',
          usagePercent,
          sentLast24Hours,
          max24HourSend,
        });
      } else if (usagePercent >= this.QUOTA_WARNING_THRESHOLD * 100) {
        status = 'warning';
        message = `SES quota warning: ${usagePercent.toFixed(1)}% used (${sentLast24Hours}/${max24HourSend} emails)`;
        this.logger.warn({
          message: 'SES quota warning',
          usagePercent,
          sentLast24Hours,
          max24HourSend,
        });
      }

      const result: QuotaCheck = {
        status,
        usagePercent: parseFloat(usagePercent.toFixed(2)),
        sentLast24Hours,
        max24HourSend,
        maxSendRate,
        message,
      };

      // Atualizar cache
      this.quotaCache = {
        data: result,
        timestamp: Date.now(),
      };

      return result;
    } catch (error) {
      this.logger.error({
        message: 'Failed to check SES quota',
        error: error.message,
      });

      // Em caso de erro, retornar unhealthy
      return {
        status: 'unhealthy',
        usagePercent: -1,
        sentLast24Hours: 0,
        max24HourSend: 0,
        maxSendRate: 0,
        message: `Failed to check SES quota: ${error.message}`,
      };
    }
  }

  private timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SES quota check timeout')), ms)
    );
  }

  async getHealthStatus() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkSESQuota(), // Adicionar quota check
    ]);

    const dbCheck = checks[0].status === 'fulfilled' ? checks[0].value : null;
    const redisCheck = checks[1].status === 'fulfilled' ? checks[1].value : null;
    const sesQuotaCheck = checks[2].status === 'fulfilled' ? checks[2].value : null;

    const isHealthy =
      dbCheck?.status === 'healthy' &&
      redisCheck?.status === 'healthy' &&
      (sesQuotaCheck?.status === 'healthy' || sesQuotaCheck?.status === 'warning');

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbCheck,
        redis: redisCheck,
        sesQuota: sesQuotaCheck,
      },
    };
  }
}
```

**Atualizar endpoint:** `apps/api/src/modules/health/health.controller.ts`

```typescript
@Get('readyz')
async readiness() {
  const health = await this.healthService.getHealthStatus();

  if (health.status !== 'healthy') {
    throw new ServiceUnavailableException(health);
  }

  return health;
}

// Endpoint adicional para ver apenas quota
@Get('ses-quota')
async sesQuota() {
  return this.healthService.checkSESQuota();
}
```

**Testes:**

```typescript
describe('HealthService - SES Quota Check', () => {
  it('should return healthy when quota usage < 80%', async () => {
    mockSesClient.send.mockResolvedValue({
      SentLast24Hours: 100,
      Max24HourSend: 1000,
      MaxSendRate: 10,
    });

    const result = await service.checkSESQuota();

    expect(result.status).toBe('healthy');
    expect(result.usagePercent).toBe(10);
  });

  it('should return warning when quota usage >= 80%', async () => {
    mockSesClient.send.mockResolvedValue({
      SentLast24Hours: 850,
      Max24HourSend: 1000,
      MaxSendRate: 10,
    });

    const result = await service.checkSESQuota();

    expect(result.status).toBe('warning');
    expect(result.usagePercent).toBe(85);
    expect(result.message).toContain('warning');
  });

  it('should return unhealthy when quota usage >= 95%', async () => {
    mockSesClient.send.mockResolvedValue({
      SentLast24Hours: 980,
      Max24HourSend: 1000,
      MaxSendRate: 10,
    });

    const result = await service.checkSESQuota();

    expect(result.status).toBe('unhealthy');
    expect(result.usagePercent).toBe(98);
  });

  it('should use cache for subsequent calls within TTL', async () => {
    mockSesClient.send.mockResolvedValue({
      SentLast24Hours: 100,
      Max24HourSend: 1000,
      MaxSendRate: 10,
    });

    await service.checkSESQuota();
    await service.checkSESQuota();

    expect(mockSesClient.send).toHaveBeenCalledTimes(1);
  });

  it('should handle SES API errors gracefully', async () => {
    mockSesClient.send.mockRejectedValue(new Error('SES unavailable'));

    const result = await service.checkSESQuota();

    expect(result.status).toBe('unhealthy');
    expect(result.message).toContain('Failed to check SES quota');
  });
});
```

**Configuração (.env):**

```bash
# SES Quota Monitoring
SES_QUOTA_WARNING_THRESHOLD=80  # Percentage
SES_QUOTA_CRITICAL_THRESHOLD=95 # Percentage
SES_QUOTA_CHECK_INTERVAL=60000  # Cache TTL in ms
```

## Categoria
**Observabilidade - Proativo**

## Bloqueador para Produção?
**NÃO** - Mas fortemente recomendado para produção. Evita surpresas com quota excedida.
