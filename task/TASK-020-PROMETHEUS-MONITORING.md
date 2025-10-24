# TASK-020 — Implementar Monitoramento Básico com Prometheus (Observability - Priority 1)

## Contexto
- Origem: Análise de arquitetura - Sistema 75% completo
- Resumo: Sistema não possui monitoramento de métricas em tempo real. Impossível detectar problemas (lentidão, erros, filas crescentes) antes de usuários reclamarem.

## O que precisa ser feito
- [ ] Instalar `@willsoto/nestjs-prometheus` e `prom-client`
- [ ] Configurar Prometheus module no NestJS
- [ ] Expor endpoint `/metrics` na API e Worker
- [ ] Adicionar métricas de negócio (emails enviados, falhas, retry)
- [ ] Adicionar métricas técnicas (latência HTTP, tamanho da fila, CPU, memória)
- [ ] Configurar scraping do Prometheus (docker-compose)
- [ ] Criar dashboards básicos no Grafana
- [ ] Documentar alertas críticos (fila > 10k, taxa de erro > 5%)

## Urgência
- **Nível (1–5):** 5 (CRÍTICO - Production Blocker)

## Responsável sugerido
- Backend + DevOps + SRE

## Dependências / Riscos
- Dependências:
  - `@willsoto/nestjs-prometheus`
  - `prom-client`
  - Prometheus server (Docker)
  - Grafana (opcional, mas recomendado)
- Riscos:
  - CRÍTICO: Sem métricas, impossível operar sistema em produção
  - Prometheus adiciona ~5-10ms latência por request (aceitável)
  - Armazenamento de métricas (~1GB/month para 1M emails/month)

## Detalhes Técnicos

### 1. Instalar dependências

```bash
cd apps/api
npm install @willsoto/nestjs-prometheus prom-client

cd apps/worker
npm install @willsoto/nestjs-prometheus prom-client
```

### 2. Configurar Prometheus no NestJS API

**Arquivo:** `apps/api/src/app.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { EmailModule } from './modules/email/email.module';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
        config: {
          prefix: 'email_gateway_api_',
        },
      },
    }),
    EmailModule,
    // ... other modules
  ],
})
export class AppModule {}
```

### 3. Criar serviço de métricas customizadas

**Arquivo:** `apps/api/src/metrics/metrics.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('email_sent_total')
    public emailSentCounter: Counter<string>,

    @InjectMetric('email_failed_total')
    public emailFailedCounter: Counter<string>,

    @InjectMetric('email_retry_total')
    public emailRetryCounter: Counter<string>,

    @InjectMetric('email_send_duration_seconds')
    public emailSendDuration: Histogram<string>,

    @InjectMetric('email_queue_size')
    public emailQueueSize: Gauge<string>,

    @InjectMetric('encryption_duration_seconds')
    public encryptionDuration: Histogram<string>,
  ) {}

  // Track successful email sent
  recordEmailSent(companyId: string, provider: string = 'ses') {
    this.emailSentCounter.inc({
      company_id: companyId,
      provider,
    });
  }

  // Track email failure
  recordEmailFailed(companyId: string, reason: string, provider: string = 'ses') {
    this.emailFailedCounter.inc({
      company_id: companyId,
      reason,
      provider,
    });
  }

  // Track email retry
  recordEmailRetry(companyId: string, attemptNumber: number) {
    this.emailRetryCounter.inc({
      company_id: companyId,
      attempt: attemptNumber.toString(),
    });
  }

  // Track email send duration
  recordEmailSendDuration(durationSeconds: number, companyId: string) {
    this.emailSendDuration.observe(
      {
        company_id: companyId,
      },
      durationSeconds
    );
  }

  // Track queue size
  updateQueueSize(queueName: string, size: number) {
    this.emailQueueSize.set({ queue: queueName }, size);
  }

  // Track encryption performance
  recordEncryptionDuration(durationSeconds: number) {
    this.encryptionDuration.observe(durationSeconds);
  }
}
```

**Arquivo:** `apps/api/src/metrics/metrics.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { PrometheusModule, makeCounterProvider, makeHistogramProvider, makeGaugeProvider } from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';

@Module({
  imports: [PrometheusModule],
  providers: [
    MetricsService,
    makeCounterProvider({
      name: 'email_sent_total',
      help: 'Total number of emails successfully sent',
      labelNames: ['company_id', 'provider'],
    }),
    makeCounterProvider({
      name: 'email_failed_total',
      help: 'Total number of failed emails',
      labelNames: ['company_id', 'reason', 'provider'],
    }),
    makeCounterProvider({
      name: 'email_retry_total',
      help: 'Total number of email retries',
      labelNames: ['company_id', 'attempt'],
    }),
    makeHistogramProvider({
      name: 'email_send_duration_seconds',
      help: 'Email send duration in seconds',
      labelNames: ['company_id'],
      buckets: [0.1, 0.5, 1, 2, 5, 10], // 100ms, 500ms, 1s, 2s, 5s, 10s
    }),
    makeGaugeProvider({
      name: 'email_queue_size',
      help: 'Current size of email queue',
      labelNames: ['queue'],
    }),
    makeHistogramProvider({
      name: 'encryption_duration_seconds',
      help: 'CPF/CNPJ encryption duration in seconds',
      buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1], // 10ms, 50ms, 100ms, 200ms, 500ms, 1s
    }),
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
```

### 4. Instrumentar email service

**Arquivo:** `apps/api/src/modules/email/services/email-send.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../metrics/metrics.service';

@Injectable()
export class EmailSendService {
  constructor(
    private readonly metricsService: MetricsService,
    // ... other dependencies
  ) {}

  async sendEmail(data: EmailSendDto, companyId: string) {
    const startTime = performance.now();

    try {
      // ... email sending logic

      // Track encryption performance
      if (recipient?.cpfCnpj) {
        const encStartTime = performance.now();
        const { encrypted, salt } = encryptCpfCnpj(recipient.cpfCnpj, this.encryptionKey);
        const encDuration = (performance.now() - encStartTime) / 1000;
        this.metricsService.recordEncryptionDuration(encDuration);
      }

      // ... rest of logic

      // Track success
      const duration = (performance.now() - startTime) / 1000;
      this.metricsService.recordEmailSent(companyId);
      this.metricsService.recordEmailSendDuration(duration, companyId);

      return result;
    } catch (error) {
      // Track failure
      this.metricsService.recordEmailFailed(
        companyId,
        error.constructor.name,
        'ses'
      );
      throw error;
    }
  }
}
```

### 5. Instrumentar worker (Queue Service)

**Arquivo:** `apps/worker/src/services/queue.service.ts`

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class QueueService implements OnModuleInit {
  constructor(
    private readonly metricsService: MetricsService,
    // ... other dependencies
  ) {}

  async onModuleInit() {
    // Update queue size every 10 seconds
    setInterval(async () => {
      const waiting = await this.queue.getWaitingCount();
      const active = await this.queue.getActiveCount();
      const delayed = await this.queue.getDelayedCount();
      const failed = await this.queue.getFailedCount();

      this.metricsService.updateQueueSize('email_queue_waiting', waiting);
      this.metricsService.updateQueueSize('email_queue_active', active);
      this.metricsService.updateQueueSize('email_queue_delayed', delayed);
      this.metricsService.updateQueueSize('email_queue_failed', failed);
    }, 10000); // 10 seconds
  }

  async processJob(job: Job) {
    const startTime = performance.now();

    try {
      // Process job...

      const duration = (performance.now() - startTime) / 1000;
      this.metricsService.recordEmailSent(job.data.companyId, 'ses');
      this.metricsService.recordEmailSendDuration(duration, job.data.companyId);
    } catch (error) {
      // Track retry
      if (job.attemptsMade < 3) {
        this.metricsService.recordEmailRetry(
          job.data.companyId,
          job.attemptsMade + 1
        );
      } else {
        this.metricsService.recordEmailFailed(
          job.data.companyId,
          error.constructor.name,
          'ses'
        );
      }
      throw error;
    }
  }
}
```

### 6. Configurar Prometheus server (Docker Compose)

**Arquivo:** `docker-compose.monitoring.yml`

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:v2.47.0
    container_name: email-gateway-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
    restart: unless-stopped

  grafana:
    image: grafana/grafana:10.1.0
    container_name: email-gateway-grafana
    ports:
      - "3001:3000"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./grafana/datasources:/etc/grafana/provisioning/datasources
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    restart: unless-stopped

volumes:
  prometheus_data:
  grafana_data:
```

**Arquivo:** `prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'email-gateway-api'
    static_configs:
      - targets: ['host.docker.internal:3000']
    metrics_path: '/metrics'

  - job_name: 'email-gateway-worker'
    static_configs:
      - targets: ['host.docker.internal:3001']
    metrics_path: '/metrics'
```

### 7. Criar dashboard básico no Grafana

**Arquivo:** `grafana/dashboards/email-gateway.json`

```json
{
  "dashboard": {
    "title": "Email Gateway - Overview",
    "panels": [
      {
        "title": "Emails Sent (rate)",
        "targets": [
          {
            "expr": "rate(email_sent_total[5m])",
            "legendFormat": "{{company_id}}"
          }
        ]
      },
      {
        "title": "Email Failure Rate",
        "targets": [
          {
            "expr": "rate(email_failed_total[5m]) / rate(email_sent_total[5m]) * 100",
            "legendFormat": "Failure %"
          }
        ]
      },
      {
        "title": "Queue Size",
        "targets": [
          {
            "expr": "email_queue_size",
            "legendFormat": "{{queue}}"
          }
        ]
      },
      {
        "title": "Email Send Duration (p95)",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(email_send_duration_seconds_bucket[5m]))",
            "legendFormat": "p95"
          }
        ]
      }
    ]
  }
}
```

### 8. Definir alertas críticos

**Arquivo:** `prometheus/alerts.yml`

```yaml
groups:
  - name: email_gateway_alerts
    interval: 30s
    rules:
      - alert: HighEmailFailureRate
        expr: rate(email_failed_total[5m]) / rate(email_sent_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Email failure rate > 5%"
          description: "Failure rate: {{ $value }}%"

      - alert: QueueBacklog
        expr: email_queue_size{queue="email_queue_waiting"} > 10000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Email queue backlog > 10k"
          description: "Queue size: {{ $value }}"

      - alert: HighEncryptionLatency
        expr: histogram_quantile(0.95, rate(encryption_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Encryption p95 > 500ms"
          description: "Latency: {{ $value }}s"
```

### 9. Rodar stack de monitoramento

```bash
# Subir Prometheus + Grafana
docker-compose -f docker-compose.monitoring.yml up -d

# Acessar Prometheus
open http://localhost:9090

# Acessar Grafana (admin/admin)
open http://localhost:3001

# Ver métricas da API
curl http://localhost:3000/metrics

# Ver métricas do Worker
curl http://localhost:3001/metrics
```

## Categoria
**Observability - Metrics**

## Bloqueador para Produção?
**SIM - CRÍTICO**

Sem monitoramento:
- ❌ Impossível detectar problemas em tempo real
- ❌ Não há visibilidade de performance (latência, taxa de erro)
- ❌ Impossível alertar time quando sistema degrada
- ❌ Difícil identificar causa raiz de problemas

**Prioridade Máxima:** Implementar antes de deploy em produção.

**Métricas essenciais para produção:**
- ✅ Taxa de envio de emails (emails/s)
- ✅ Taxa de falha (%)
- ✅ Tamanho da fila (waiting, active, failed)
- ✅ Latência de envio (p50, p95, p99)
- ✅ Latência de encryption (p95)
