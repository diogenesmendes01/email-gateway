# TASK-012 — Monitoramento de Performance de Criptografia (Performance)

## Contexto
- Origem: PR-BACKLOG (PR18-RAFAEL-03)
- Resumo: PBKDF2 com 100k iterações pode adicionar 50-100ms de latência por CPF/CNPJ. Importante monitorar para detectar degradação de performance em escala

## O que precisa ser feito
- [ ] Adicionar timer antes/depois de `encryptCpfCnpj()`
- [ ] Logar warning se duração > 200ms
- [ ] Adicionar métrica Prometheus `encryption_duration_seconds` (opcional)
- [ ] Criar alerta se P95 > 200ms (futuro)
- [ ] Documentar threshold em runbook

## Urgência
- **Nível (1–5):** 4 (NICE TO HAVE - Performance)

## Responsável sugerido
- Backend

## Dependências / Riscos
- Dependências: Nenhuma (logging básico), Prometheus (opcional para métricas)
- Riscos:
  - Nenhum: Apenas observabilidade
  - Overhead mínimo (< 1ms para timestamp)

## Detalhes Técnicos

**Atualizar:** `apps/api/src/modules/email/services/email-send.service.ts`

```typescript
import { Logger } from '@nestjs/common';

@Injectable()
export class EmailSendService {
  private readonly logger = new Logger(EmailSendService.name);
  private readonly ENCRYPTION_SLOW_THRESHOLD_MS = 200;

  // ... outros métodos

  private async createRecipient(
    dto: CreateRecipientDto,
    companyId: string,
    requestId: string
  ) {
    const data: any = {
      email: dto.email,
      externalId: dto.externalId,
      companyId,
    };

    // Se CPF/CNPJ fornecido, criptografar
    if (dto.cpfCnpj) {
      const startTime = performance.now();

      try {
        const hash = hashCpfCnpjSha256(dto.cpfCnpj);
        const { encrypted, salt } = encryptCpfCnpj(
          dto.cpfCnpj,
          this.getEncryptionKey()
        );

        const durationMs = performance.now() - startTime;

        // Log slow encryption
        if (durationMs > this.ENCRYPTION_SLOW_THRESHOLD_MS) {
          this.logger.warn({
            message: 'Slow CPF/CNPJ encryption detected',
            durationMs: Math.round(durationMs),
            threshold: this.ENCRYPTION_SLOW_THRESHOLD_MS,
            requestId,
            companyId,
          });
        }

        // Log metrics (debug level)
        this.logger.debug({
          message: 'CPF/CNPJ encrypted',
          durationMs: Math.round(durationMs),
          requestId,
        });

        // Opcional: Emit Prometheus metric
        // this.metricsService.recordHistogram(
        //   'encryption_duration_seconds',
        //   durationMs / 1000,
        //   { operation: 'encrypt_cpf_cnpj' }
        // );

        data.cpfCnpjHash = hash;
        data.cpfCnpjEnc = encrypted;
        data.cpfCnpjSalt = salt;
      } catch (error) {
        const durationMs = performance.now() - startTime;

        this.logger.error({
          message: 'CPF/CNPJ encryption failed',
          error: error.message,
          durationMs: Math.round(durationMs),
          requestId,
          companyId,
        });

        throw error;
      }
    }

    return this.prisma.recipient.create({ data });
  }
}
```

**Configuração de threshold (.env):**

```bash
# Encryption Performance
ENCRYPTION_SLOW_THRESHOLD_MS=200  # Log warning se encryption > 200ms
```

**Opcional: Service para métricas Prometheus**

Se quiser adicionar métricas Prometheus no futuro:

```typescript
// apps/api/src/services/metrics.service.ts
import { Injectable } from '@nestjs/common';
import { Registry, Histogram } from 'prom-client';

@Injectable()
export class MetricsService {
  private registry: Registry;
  private encryptionDurationHistogram: Histogram;

  constructor() {
    this.registry = new Registry();

    this.encryptionDurationHistogram = new Histogram({
      name: 'encryption_duration_seconds',
      help: 'Time to encrypt CPF/CNPJ in seconds',
      labelNames: ['operation'],
      buckets: [0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 1.0], // 50ms, 100ms, 150ms, 200ms, 300ms, 500ms, 1s
      registers: [this.registry],
    });
  }

  recordEncryptionDuration(durationMs: number) {
    this.encryptionDurationHistogram
      .labels({ operation: 'encrypt_cpf_cnpj' })
      .observe(durationMs / 1000);
  }

  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
```

**Endpoint de métricas:**

```typescript
// apps/api/src/controllers/metrics.controller.ts
@Controller('metrics')
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  @Get()
  async getMetrics() {
    return this.metricsService.getMetrics();
  }
}
```

**Exemplo de métrica Prometheus:**

```
# HELP encryption_duration_seconds Time to encrypt CPF/CNPJ in seconds
# TYPE encryption_duration_seconds histogram
encryption_duration_seconds_bucket{operation="encrypt_cpf_cnpj",le="0.05"} 245
encryption_duration_seconds_bucket{operation="encrypt_cpf_cnpj",le="0.1"} 892
encryption_duration_seconds_bucket{operation="encrypt_cpf_cnpj",le="0.2"} 995
encryption_duration_seconds_bucket{operation="encrypt_cpf_cnpj",le="0.3"} 998
encryption_duration_seconds_bucket{operation="encrypt_cpf_cnpj",le="+Inf"} 1000
encryption_duration_seconds_sum{operation="encrypt_cpf_cnpj"} 85.3
encryption_duration_seconds_count{operation="encrypt_cpf_cnpj"} 1000
```

**Alerta Prometheus (futuro):**

```yaml
# prometheus/alerts/encryption.yml
groups:
  - name: encryption
    interval: 30s
    rules:
      - alert: SlowEncryption
        expr: histogram_quantile(0.95, rate(encryption_duration_seconds_bucket[5m])) > 0.2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P95 encryption latency > 200ms"
          description: "Encryption is taking too long. Consider investigating server load or encryption algorithm."

      - alert: VerySlowEncryption
        expr: histogram_quantile(0.95, rate(encryption_duration_seconds_bucket[5m])) > 0.5
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "P95 encryption latency > 500ms"
          description: "Encryption is critically slow. Immediate investigation required."
```

**Dashboard Grafana (futuro):**

```json
{
  "panels": [
    {
      "title": "Encryption Duration (P95)",
      "targets": [
        {
          "expr": "histogram_quantile(0.95, rate(encryption_duration_seconds_bucket[5m]))"
        }
      ]
    },
    {
      "title": "Slow Encryptions (>200ms)",
      "targets": [
        {
          "expr": "sum(rate(encryption_duration_seconds_bucket{le=\"0.2\"}[5m]))"
        }
      ]
    }
  ]
}
```

**Testes:**

```typescript
describe('Encryption Performance Monitoring', () => {
  it('should log warning when encryption takes > 200ms', async () => {
    const loggerWarnSpy = jest.spyOn(service['logger'], 'warn');

    // Simular encryption lenta (mock)
    jest.spyOn(global, 'performance').mockReturnValueOnce({
      now: jest.fn()
        .mockReturnValueOnce(0)    // startTime
        .mockReturnValueOnce(250), // endTime (250ms)
    } as any);

    await service['createRecipient'](
      { email: 'test@example.com', cpfCnpj: '12345678901' },
      'company-123',
      'request-123'
    );

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Slow CPF/CNPJ encryption detected',
        durationMs: 250,
      })
    );
  });

  it('should not log warning when encryption is fast', async () => {
    const loggerWarnSpy = jest.spyOn(service['logger'], 'warn');

    // Encryption rápida
    jest.spyOn(global, 'performance').mockReturnValueOnce({
      now: jest.fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(50), // 50ms
    } as any);

    await service['createRecipient'](
      { email: 'test@example.com', cpfCnpj: '12345678901' },
      'company-123',
      'request-123'
    );

    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });
});
```

## Categoria
**Performance - Observabilidade**

## Bloqueador para Produção?
**NÃO** - Nice to have. Útil para detectar degradação de performance em produção.
