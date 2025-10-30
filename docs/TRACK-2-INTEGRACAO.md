# 🔗 GUIA DE INTEGRAÇÃO - TRACK 2

## Integração com Track 1 (Drivers & Infraestrutura)

### 1. Usar Suppression Service no Email Send Processor

**Arquivo:** `apps/worker/src/processors/email-send.processor.ts`

```typescript
import { SuppressionService } from '../modules/suppression/suppression.service';

@Processor('email')
export class EmailSendProcessor {
  constructor(
    private suppression: SuppressionService,
    // ... outros
  ) {}

  @Process('send')
  async handleEmailSend(job: Job<EmailSendJobData>) {
    // ✅ NOVO: Verificar supressão antes de enviar
    const suppressed = await this.suppression.checkSuppression(
      job.data.companyId,
      job.data.to
    );

    if (suppressed.suppressed) {
      this.logger.log(`Email suprimido: ${job.data.to} (${suppressed.reason})`);
      // Marcar como SUPPRESSED no email_log
      return { status: 'suppressed', reason: suppressed.reason };
    }

    // ... resto do código
  }
}
```

### 2. Aplicar Warm-up Limit no Rate Limiting

**Arquivo:** `apps/worker/src/services/email-send.service.ts`

```typescript
import { WarmupSchedulerService } from './warmup-scheduler.service';

@Injectable()
export class EmailSendService {
  constructor(
    private warmup: WarmupSchedulerService,
    // ... outros
  ) {}

  async checkRateLimit(domainId: string, to: string): Promise<boolean> {
    // ✅ NOVO: Obter limite de warm-up
    const dailyLimit = await this.warmup.getDailyLimit(domainId);
    
    if (dailyLimit) {
      const sentToday = await this.countSentToday(domainId);
      if (sentToday >= dailyLimit) {
        this.logger.warn(`Warm-up limit reached for ${domainId}`);
        return false; // Rejeitar envio
      }
    }

    // ... resto do rate limiting
    return true;
  }
}
```

### 3. Disparar Webhook Ingest ao Receber eventos SES SNS

**Arquivo:** `apps/api/src/modules/webhook/ses-webhook.controller.ts`

```typescript
import { WebhookQueueService } from './webhook-queue.service';

@Controller('webhooks')
export class SesWebhookController {
  constructor(
    private webhookQueue: WebhookQueueService,
  ) {}

  @Post('ses')
  async handleSESEvent(@Body() payload: any) {
    // ✅ NOVO: Enfileirar para WebhookIngestWorker
    const { eventType, message } = payload;
    
    const event = this.mapSESEventType(eventType);
    
    await this.webhookQueue.enqueueWebhook({
      provider: 'ses',
      event,
      rawPayload: payload,
      receivedAt: new Date(),
    });

    return { status: 'accepted' };
  }

  private mapSESEventType(sesType: string): any {
    switch (sesType) {
      case 'Bounce': return { type: 'bounce', messageId: message.messageId };
      case 'Complaint': return { type: 'complaint', messageId: message.messageId };
      case 'Delivery': return { type: 'delivery', messageId: message.messageId };
      default: return { type: 'unknown', messageId: message.messageId };
    }
  }
}
```

### 4. Integrar Reputation Monitor no Healthcheck

**Arquivo:** `apps/api/src/modules/health/health.service.ts`

```typescript
import { ReputationMonitorService } from '../../worker/services/reputation-monitor.service';

@Injectable()
export class HealthService {
  constructor(
    private reputation: ReputationMonitorService,
  ) {}

  async checkReputation(): Promise<any> {
    // ✅ NOVO: Verificar guardrails para empresa
    const companyId = getCurrentCompanyId(); // Seu contexto
    
    const enforcement = await this.reputation.checkAndEnforce(companyId);
    
    return {
      status: enforcement.actions.length === 0 ? 'healthy' : 'degraded',
      violations: enforcement.bounceRateViolation || enforcement.complaintRateViolation,
      actions: enforcement.actions,
    };
  }
}
```

---

## Integração com Track 3 (Domínios & Onboarding)

### 1. Dashboard de Reputação

**Arquivo:** `apps/dashboard/src/pages/Reputation.tsx`

```typescript
import { useQuery } from '@tanstack/react-query';
import { Chart } from 'react-chartjs-2';

export function ReputationDashboard() {
  const { data: metrics } = useQuery({
    queryKey: ['reputation', 'metrics'],
    queryFn: async () => {
      const res = await fetch('/v1/metrics/dashboard');
      return res.json();
    },
  });

  // ✅ NOVO: Exibir gráficos de reputação
  return (
    <div>
      <h2>Email Reputation</h2>
      
      {/* Bounce Rate Chart */}
      <Chart type="line" data={{
        labels: metrics?.dates,
        datasets: [{
          label: 'Bounce Rate',
          data: metrics?.bounceRates,
          borderColor: 'red',
          fill: false,
        }],
      }} />

      {/* Complaint Rate Chart */}
      <Chart type="line" data={{
        labels: metrics?.dates,
        datasets: [{
          label: 'Complaint Rate',
          data: metrics?.complaintRates,
          borderColor: 'orange',
          fill: false,
        }],
      }} />

      {/* Reputation Score */}
      <div className="score-card">
        <h3>Reputation Score</h3>
        <div className="score-display">
          {metrics?.currentScore?.toFixed(1)}
        </div>
      </div>

      {/* Guardrails Status */}
      {metrics?.violations?.length > 0 && (
        <div className="alerts">
          {metrics.violations.map(v => (
            <Alert key={v.type} severity="warning">
              {v.message}
            </Alert>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 2. Warm-up Progress Visualizer

**Arquivo:** `apps/dashboard/src/pages/WarmupProgress.tsx`

```typescript
export function WarmupProgress({ domainId }: { domainId: string }) {
  const { data: status } = useQuery({
    queryKey: ['warmup', domainId],
    queryFn: async () => {
      const res = await fetch(`/v1/domains/${domainId}/warmup/status`);
      return res.json();
    },
  });

  // ✅ NOVO: Exibir progresso de warm-up
  return (
    <div className="warmup-card">
      <h3>Domain Warm-up Progress</h3>
      
      <ProgressBar 
        value={status?.progressPercentage} 
        max={100}
      />

      <div className="warmup-info">
        <p>Days Active: {status?.daysSinceStart}</p>
        <p>Current Limit: {status?.currentLimit} emails/day</p>
        <p>Max Limit: {status?.maxLimit} emails/day</p>
        <p>Est. Completion: {status?.estimatedCompletionDate}</p>
      </div>

      <div className="warmup-recommendations">
        {status?.recommendations?.map((rec, i) => (
          <p key={i}>{rec}</p>
        ))}
      </div>
    </div>
  );
}
```

### 3. Suppression List Manager

**Arquivo:** `apps/dashboard/src/pages/SuppressionManager.tsx`

```typescript
export function SuppressionManager() {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState<SuppressionReason>();
  
  const { data: suppressions } = useQuery({
    queryKey: ['suppressions'],
    queryFn: async () => {
      const res = await fetch('/v1/suppressions');
      return res.json();
    },
  });

  const addSuppression = async () => {
    // ✅ NOVO: Adicionar email à supressão
    await fetch('/v1/suppressions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, reason }),
    });
  };

  const importSuppressions = async (file: File) => {
    // ✅ NOVO: Importar em massa
    const emails = await file.text().then(t => t.split('\n'));
    
    await fetch('/v1/suppressions/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emails,
        reason: 'MANUAL',
        source: 'import',
      }),
    });
  };

  return (
    <div>
      <h2>Suppression List</h2>
      
      {/* Add Single Email */}
      <form onSubmit={(e) => { e.preventDefault(); addSuppression(); }}>
        <input 
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
        />
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Select reason</option>
          <option value="HARD_BOUNCE">Hard Bounce</option>
          <option value="SPAM_COMPLAINT">Spam Complaint</option>
          <option value="MANUAL">Manual</option>
        </select>
        <button type="submit">Add</button>
      </form>

      {/* Import CSV */}
      <input 
        type="file"
        onChange={(e) => importSuppressions(e.target.files[0])}
        accept=".csv,.txt"
      />

      {/* List */}
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Reason</th>
            <th>Suppressed At</th>
            <th>Expires At</th>
          </tr>
        </thead>
        <tbody>
          {suppressions?.data?.map((s) => (
            <tr key={s.id}>
              <td>{s.email}</td>
              <td>{s.reason}</td>
              <td>{new Date(s.suppressedAt).toLocaleDateString()}</td>
              <td>{s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : 'Never'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### 4. API Endpoints para Dashboard

**Arquivo:** `apps/api/src/modules/reputation/reputation.controller.ts`

```typescript
@Controller('v1/reputation')
export class ReputationController {
  constructor(
    private reputation: ReputationMonitorService,
    private prisma: PrismaService,
  ) {}

  // ✅ NOVO: Dashboard data
  @Get('dashboard')
  async getDashboard(@CurrentCompany() companyId: string) {
    const metrics = await this.prisma.reputationMetric.findMany({
      where: { companyId },
      orderBy: { date: 'desc' },
      take: 30,
    });

    return {
      currentScore: metrics[0]?.reputationScore,
      bounceRates: metrics.map(m => m.bounceRate),
      complaintRates: metrics.map(m => m.complaintRate),
      dates: metrics.map(m => m.date),
      violations: this.extractViolations(metrics[0]),
    };
  }

  // ✅ NOVO: Warm-up status
  @Get('domains/:id/warmup/status')
  async getWarmupStatus(@Param('id') domainId: string) {
    const warmupScheduler = this.app.get(WarmupSchedulerService);
    return await warmupScheduler.getWarmupStatus(domainId);
  }

  private extractViolations(metric: ReputationMetric) {
    const violations = [];
    if (metric.bounceRate >= 0.02) {
      violations.push({
        type: 'high_bounce_rate',
        message: `Bounce rate high: ${(metric.bounceRate * 100).toFixed(2)}%`,
      });
    }
    if (metric.complaintRate >= 0.001) {
      violations.push({
        type: 'high_complaint_rate',
        message: `Complaint rate high: ${(metric.complaintRate * 100).toFixed(3)}%`,
      });
    }
    return violations;
  }
}
```

---

## Checklist de Integração

### Track 1 Integration
- [ ] SuppressionService injetado em EmailSendProcessor
- [ ] WarmupSchedulerService consultado antes de enviar
- [ ] ReputationMonitorService aplicando guardrails
- [ ] Webhook SES/Postal enfileirando para WebhookIngestWorker
- [ ] Testes de integração end-to-end

### Track 3 Integration
- [ ] Dashboard exibindo ReputationMetric
- [ ] Warm-up progress visualizer funcionando
- [ ] Suppression Manager CRUD
- [ ] API endpoints retornando dados corretos
- [ ] Gráficos atualizando em tempo real

### Database
- [ ] Migrations executadas
- [ ] Tabelas criadas
- [ ] Índices aplicados
- [ ] Relacionamentos funcionando

### Monitoring
- [ ] Logs de webhooks
- [ ] Logs de guardrails
- [ ] Métricas no Prometheus
- [ ] Alertas configurados

---

## Troubleshooting

### Webhook não está sendo processado
```
1. Verificar logs: grep "WebhookIngestWorker" app.log
2. Verificar fila: redis-cli LLEN webhook-ingest
3. Validar HMAC: console.log signature validation resultado
4. Checar payload format: POST body válido?
```

### Suppression não está funcionando
```
1. Verificar banco: SELECT * FROM suppressions WHERE email = 'test@example.com';
2. Verificar query na checkSuppression
3. Validar role account detection
4. Checar expiração de soft bounces
```

### Warm-up não escalando
```
1. Verificar config: SELECT warmup_config FROM domains WHERE id = 'xxx';
2. Checar datasSince calculado corretamente
3. Validar formula exponencial: 50 * (1.5 ^ days)
4. Verificar limits aplicados em sendEmail
```

### Reputação não atualizando
```
1. Verificar cron: ReputationCalculatorWorker rodando a cada 1h?
2. Checar métricas: SELECT * FROM reputation_metrics ORDER BY date DESC LIMIT 1;
3. Validar guardrails: company.isSuspended está true?
4. Logs de alerts: grep "ALERT\|PAUSE\|THROTTLE" app.log
```

---

## Performance Tuning

### Índices de Banco de Dados
```sql
-- Verificar índices criados
SELECT * FROM pg_stat_user_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('suppressions', 'reputation_metrics', 'email_tracking');

-- Verificar queries lentas
SELECT query, calls, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC LIMIT 10;
```

### Redis Monitoring
```bash
# Tamanho da fila webhook
redis-cli LLEN webhook-ingest

# Memória total
redis-cli INFO memory

# Keys por tipo
redis-cli --pattern "webhook:*" SCAN 0
```

### Database Monitoring
```sql
-- Tamanho de tabelas
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Próximos Passos

1. ✅ Track 2 Completa
2. ⏳ Implementar Track 1 (Person A)
3. ⏳ Implementar Track 3 (Person C)
4. ⏳ Integração entre tracks
5. ⏳ Testes end-to-end
6. ⏳ Deploy staging
7. ⏳ Deploy produção

---

**Pronto para integrar!** 🚀
