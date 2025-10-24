# TASK-021 — DLQ Monitoring e Alertas (Observability - Priority 1)

## Contexto
- Origem: Análise de arquitetura - Sistema 75% completo
- Resumo: Dead Letter Queue (DLQ) existe no BullMQ mas não tem monitoramento nem alertas. Emails que falharam 3x ficam na DLQ sem visibilidade, perdidos para sempre.

## O que precisa ser feito
- [ ] Criar worker dedicado para processar DLQ periodicamente
- [ ] Adicionar métricas Prometheus para DLQ (tamanho, idade dos jobs)
- [ ] Criar alertas para DLQ não vazia (Slack/PagerDuty/Email)
- [ ] Implementar dashboard Grafana para visualizar DLQ
- [ ] Criar endpoint `/admin/dlq` para listar jobs falhados
- [ ] Implementar retry manual via API (`POST /admin/dlq/:jobId/retry`)
- [ ] Adicionar logs estruturados para jobs que entram na DLQ
- [ ] Documentar processo de investigação de DLQ

## Urgência
- **Nível (1–5):** 5 (CRÍTICO - Production Blocker)

## Responsável sugerido
- Backend + DevOps + SRE

## Dependências / Riscos
- Dependências:
  - BullMQ (já instalado)
  - Prometheus (TASK-020)
  - Sistema de alertas (Slack, PagerDuty, ou email SMTP)
- Riscos:
  - CRÍTICO: Sem monitoramento de DLQ, emails perdidos ficam invisíveis
  - DLQ crescente indica problema sistêmico (SES down, configuração errada)
  - Investigar DLQ manualmente é tedioso sem ferramentas

## Detalhes Técnicos

### 1. Criar serviço de monitoramento de DLQ

**Arquivo:** `apps/worker/src/services/dlq-monitor.service.ts`

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../metrics/metrics.service';

export interface DLQJobInfo {
  id: string;
  data: any;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
  ageHours: number;
}

@Injectable()
export class DLQMonitorService implements OnModuleInit {
  private readonly logger = new Logger(DLQMonitorService.name);
  private queue: Queue;
  private checkInterval: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService
  ) {
    this.queue = new Queue('email-queue', {
      connection: {
        host: this.configService.get('REDIS_HOST'),
        port: this.configService.get('REDIS_PORT'),
      },
    });
  }

  async onModuleInit() {
    // Check DLQ every 5 minutes
    this.checkInterval = setInterval(() => {
      this.monitorDLQ();
    }, 5 * 60 * 1000); // 5 minutes

    // Run immediately on startup
    await this.monitorDLQ();
  }

  async onModuleDestroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    await this.queue.close();
  }

  /**
   * Monitor DLQ size and emit metrics/alerts
   */
  async monitorDLQ() {
    try {
      const failedJobs = await this.queue.getFailed(0, 1000); // Get up to 1000 failed jobs
      const dlqSize = failedJobs.length;

      // Update Prometheus metric
      this.metricsService.updateDLQSize(dlqSize);

      // Log if DLQ not empty
      if (dlqSize > 0) {
        this.logger.warn({
          message: 'DLQ contains failed jobs',
          dlqSize,
          oldestJob: failedJobs[0]?.id,
          newestJob: failedJobs[dlqSize - 1]?.id,
        });

        // Check for old jobs (>24h)
        const oldJobs = failedJobs.filter((job) => {
          const ageHours = (Date.now() - job.timestamp) / (1000 * 60 * 60);
          return ageHours > 24;
        });

        if (oldJobs.length > 0) {
          this.logger.error({
            message: 'DLQ contains jobs older than 24h',
            oldJobsCount: oldJobs.length,
            oldestJobAge: Math.round(
              (Date.now() - oldJobs[0].timestamp) / (1000 * 60 * 60)
            ),
          });

          // Trigger critical alert (integrate with alerting system)
          await this.sendCriticalAlert(oldJobs.length);
        }
      }

      // Check for rapidly growing DLQ (potential systemic issue)
      const recentFailures = failedJobs.filter((job) => {
        const ageMinutes = (Date.now() - job.timestamp) / (1000 * 60);
        return ageMinutes < 10; // Last 10 minutes
      });

      if (recentFailures.length > 50) {
        this.logger.error({
          message: 'High failure rate detected - potential systemic issue',
          recentFailures: recentFailures.length,
          timeWindowMinutes: 10,
        });

        await this.sendHighFailureRateAlert(recentFailures.length);
      }
    } catch (error) {
      this.logger.error({
        message: 'Failed to monitor DLQ',
        error: error.message,
      });
    }
  }

  /**
   * Get all failed jobs from DLQ with details
   */
  async getDLQJobs(limit: number = 100): Promise<DLQJobInfo[]> {
    const failedJobs = await this.queue.getFailed(0, limit);

    return failedJobs.map((job) => ({
      id: job.id,
      data: job.data,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      ageHours: Math.round((Date.now() - job.timestamp) / (1000 * 60 * 60)),
    }));
  }

  /**
   * Retry a specific job from DLQ
   */
  async retryJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found in DLQ`);
    }

    // Move job back to waiting queue
    await job.retry();

    this.logger.log({
      message: 'Job manually retried from DLQ',
      jobId,
      outboxId: job.data.outboxId,
    });
  }

  /**
   * Remove a job from DLQ (after manual investigation)
   */
  async removeJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found in DLQ`);
    }

    await job.remove();

    this.logger.log({
      message: 'Job manually removed from DLQ',
      jobId,
      outboxId: job.data.outboxId,
    });
  }

  /**
   * Send critical alert (DLQ has old jobs)
   */
  private async sendCriticalAlert(oldJobsCount: number) {
    // TODO: Integrate with alerting system (Slack, PagerDuty, etc.)
    this.logger.error({
      message: '🚨 CRITICAL ALERT: DLQ contains old jobs',
      oldJobsCount,
      action: 'Investigate immediately',
    });

    // Example: Send Slack webhook
    // await this.slackService.sendAlert({ ... });
  }

  /**
   * Send high failure rate alert
   */
  private async sendHighFailureRateAlert(recentFailures: number) {
    this.logger.error({
      message: '🚨 HIGH FAILURE RATE: Potential systemic issue',
      recentFailures,
      action: 'Check SES status, database, Redis',
    });
  }
}
```

### 2. Adicionar métricas de DLQ ao Prometheus

**Arquivo:** `apps/worker/src/metrics/metrics.service.ts` (adicionar)

```typescript
import { Gauge } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

@Injectable()
export class MetricsService {
  constructor(
    // ... existing metrics

    @InjectMetric('dlq_size')
    public dlqSizeGauge: Gauge<string>,

    @InjectMetric('dlq_oldest_job_age_hours')
    public dlqOldestJobAgeGauge: Gauge<string>,
  ) {}

  updateDLQSize(size: number) {
    this.dlqSizeGauge.set(size);
  }

  updateDLQOldestJobAge(ageHours: number) {
    this.dlqOldestJobAgeGauge.set(ageHours);
  }
}
```

**Arquivo:** `apps/worker/src/metrics/metrics.module.ts` (adicionar providers)

```typescript
makeGaugeProvider({
  name: 'dlq_size',
  help: 'Number of jobs in Dead Letter Queue',
}),
makeGaugeProvider({
  name: 'dlq_oldest_job_age_hours',
  help: 'Age of oldest job in DLQ (hours)',
}),
```

### 3. Criar endpoints de administração

**Arquivo:** `apps/api/src/modules/admin/admin.controller.ts`

```typescript
import { Controller, Get, Post, Param, UseGuards, Query } from '@nestjs/common';
import { DLQMonitorService } from '../../../worker/src/services/dlq-monitor.service';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('admin/dlq')
@UseGuards(AdminGuard) // Only admin users can access
export class AdminDLQController {
  constructor(private readonly dlqMonitorService: DLQMonitorService) {}

  /**
   * GET /admin/dlq
   * List all failed jobs in DLQ
   */
  @Get()
  async listDLQ(@Query('limit') limit: string = '100') {
    const jobs = await this.dlqMonitorService.getDLQJobs(parseInt(limit, 10));

    return {
      total: jobs.length,
      jobs,
    };
  }

  /**
   * POST /admin/dlq/:jobId/retry
   * Manually retry a failed job
   */
  @Post(':jobId/retry')
  async retryJob(@Param('jobId') jobId: string) {
    await this.dlqMonitorService.retryJob(jobId);

    return {
      message: 'Job queued for retry',
      jobId,
    };
  }

  /**
   * POST /admin/dlq/:jobId/remove
   * Manually remove a job from DLQ (after investigation)
   */
  @Post(':jobId/remove')
  async removeJob(@Param('jobId') jobId: string) {
    await this.dlqMonitorService.removeJob(jobId);

    return {
      message: 'Job removed from DLQ',
      jobId,
    };
  }
}
```

### 4. Configurar alertas Prometheus

**Arquivo:** `prometheus/alerts.yml` (adicionar)

```yaml
- alert: DLQNotEmpty
  expr: dlq_size > 0
  for: 30m
  labels:
    severity: warning
  annotations:
    summary: "Dead Letter Queue is not empty"
    description: "DLQ size: {{ $value }}. Investigate failed jobs."

- alert: DLQCritical
  expr: dlq_size > 100
  for: 15m
  labels:
    severity: critical
  annotations:
    summary: "Dead Letter Queue size > 100"
    description: "DLQ size: {{ $value }}. Potential systemic issue!"

- alert: DLQOldJobs
  expr: dlq_oldest_job_age_hours > 24
  for: 1h
  labels:
    severity: critical
  annotations:
    summary: "DLQ contains jobs older than 24h"
    description: "Oldest job: {{ $value }}h. Investigate immediately!"

- alert: HighDLQGrowthRate
  expr: rate(dlq_size[10m]) > 5
  for: 10m
  labels:
    severity: critical
  annotations:
    summary: "DLQ growing rapidly (>5 jobs/min)"
    description: "Growth rate: {{ $value }} jobs/min. Check SES, DB, Redis."
```

### 5. Criar dashboard Grafana para DLQ

**Arquivo:** `grafana/dashboards/dlq-monitoring.json`

```json
{
  "dashboard": {
    "title": "Email Gateway - DLQ Monitoring",
    "panels": [
      {
        "title": "DLQ Size",
        "targets": [
          {
            "expr": "dlq_size",
            "legendFormat": "Failed jobs"
          }
        ],
        "alert": {
          "conditions": [
            {
              "evaluator": {
                "params": [0],
                "type": "gt"
              }
            }
          ]
        }
      },
      {
        "title": "DLQ Oldest Job Age",
        "targets": [
          {
            "expr": "dlq_oldest_job_age_hours",
            "legendFormat": "Age (hours)"
          }
        ]
      },
      {
        "title": "DLQ Growth Rate",
        "targets": [
          {
            "expr": "rate(dlq_size[5m])",
            "legendFormat": "Jobs/sec"
          }
        ]
      },
      {
        "title": "Recent Failures (Last 1h)",
        "targets": [
          {
            "expr": "increase(email_failed_total[1h])",
            "legendFormat": "{{reason}}"
          }
        ]
      }
    ]
  }
}
```

### 6. Integrar com Slack para alertas

**Arquivo:** `apps/worker/src/services/slack-alert.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SlackAlertService {
  private readonly logger = new Logger(SlackAlertService.name);
  private readonly webhookUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.webhookUrl = this.configService.get('SLACK_WEBHOOK_URL');
  }

  async sendDLQAlert(dlqSize: number, oldJobsCount: number) {
    if (!this.webhookUrl) {
      this.logger.warn('Slack webhook URL not configured');
      return;
    }

    try {
      await axios.post(this.webhookUrl, {
        text: `🚨 *DLQ Alert*`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🚨 Dead Letter Queue Alert',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*DLQ Size:*\n${dlqSize}`,
              },
              {
                type: 'mrkdwn',
                text: `*Old Jobs (>24h):*\n${oldJobsCount}`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Action Required:* Investigate failed jobs at <http://localhost:3000/admin/dlq|Admin Panel>`,
            },
          },
        ],
      });

      this.logger.log('Slack alert sent successfully');
    } catch (error) {
      this.logger.error({
        message: 'Failed to send Slack alert',
        error: error.message,
      });
    }
  }
}
```

### 7. Documentar processo de investigação

**Arquivo:** `docs/DLQ-RUNBOOK.md`

```markdown
# DLQ Investigation Runbook

## When DLQ Alert Fires

1. **Check DLQ Size**
   ```bash
   curl http://localhost:3000/admin/dlq
   ```

2. **Identify Common Failure Reasons**
   - Group jobs by `failedReason`
   - Look for patterns (same error, same recipient domain)

3. **Common Failure Scenarios**

   **SES Rate Limit Exceeded:**
   - Symptom: `ThrottlingException` or `SendingPausedException`
   - Action: Wait for quota reset, increase SES limits

   **Invalid Recipient:**
   - Symptom: `MessageRejected` or `InvalidParameterValue`
   - Action: Validate email format, check blacklist

   **Network/Timeout:**
   - Symptom: `NetworkingError` or `TimeoutError`
   - Action: Check SES endpoint status, retry

4. **Manual Retry**
   ```bash
   curl -X POST http://localhost:3000/admin/dlq/{jobId}/retry
   ```

5. **Remove Unfixable Jobs**
   ```bash
   curl -X POST http://localhost:3000/admin/dlq/{jobId}/remove
   ```

6. **Update EmailOutbox Status**
   - Mark as FAILED in database
   - Add error details to `lastError` field
```

### 8. Adicionar variável de ambiente

**.env.example**

```bash
# DLQ Monitoring
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# DLQ Alert Thresholds
DLQ_ALERT_THRESHOLD=10           # Alert if DLQ size > 10
DLQ_CRITICAL_THRESHOLD=100       # Critical if DLQ size > 100
DLQ_MAX_AGE_HOURS=24            # Alert if job older than 24h
```

## Categoria
**Observability - Alerting + Monitoring**

## Bloqueador para Produção?
**SIM - CRÍTICO**

Sem monitoramento de DLQ:
- ❌ Emails perdidos ficam invisíveis
- ❌ Impossível detectar problemas sistêmicos (SES down, config errada)
- ❌ Sem processo de recuperação de falhas
- ❌ Dificuldade em diagnosticar causa raiz de falhas

**Prioridade Máxima:** Implementar antes de deploy em produção.

**Alertas críticos:**
- ✅ DLQ não vazia por > 30min
- ✅ DLQ > 100 jobs
- ✅ Jobs com > 24h no DLQ
- ✅ Taxa de crescimento > 5 jobs/min
