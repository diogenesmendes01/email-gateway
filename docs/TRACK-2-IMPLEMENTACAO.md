# TRACK 2: Webhooks & Processamento - Implementação Completa

**Status:** ✅ **100% Implementada**  
**Período:** Semana 1-11 (Sprint 1-6)  
**Responsável:** Person B - Backend Pleno/Sênior  

---

## 📋 Sumário Executivo

Track 2 implementa **100% do sistema de processamento de webhooks, supressões e reputação** conforme especificado no PLANO-MIGRACAO-ESP-SELFHOSTED.md.

Todas as funcionalidades foram desenvolvidas seguindo:
- ✅ Arquitetura definida no plano
- ✅ Interfaces TypeScript tipadas
- ✅ Banco de dados com Prisma migrations
- ✅ Serviços NestJS standalone
- ✅ Workers para processamento assíncrono
- ✅ DTOs e validações completas

---

## 🎯 Componentes Implementados

### Semana 1-2: Parsers DSN/ARF ✅

**Arquivos:**
- `apps/worker/src/types/dsn-report.types.ts` - Tipos RFC 3464
- `apps/worker/src/types/arf-report.types.ts` - Tipos RFC 5965  
- `apps/worker/src/services/dsn-parser.service.ts` - Parser DSN
- `apps/worker/src/services/arf-parser.service.ts` - Parser ARF
- `apps/worker/src/services/bounce-classifier.service.ts` - Classificador

**Funcionalidades:**
- ✅ Parse de DSN (Delivery Status Notification) - RFC 3464
- ✅ Parse de ARF (Abuse Reporting Format) - RFC 5965
- ✅ Classificação automática de bounces (hard/soft/transient)
- ✅ Extração de informações de complaints
- ✅ Análise de auth failures (DKIM/SPF/DMARC)

**Testes:**
```bash
npm test -- services/dsn-parser.service
npm test -- services/arf-parser.service
npm test -- services/bounce-classifier.service
```

---

### Semana 3-4: Webhooks Postal ✅

**Arquivos:**
- `apps/api/src/modules/webhook/postal-webhook.controller.ts` - Controller
- `apps/api/src/modules/webhook/postal-webhook-validator.service.ts` - Validador
- `apps/worker/src/webhook-ingest-worker.ts` - Worker de processamento

**Funcionalidades:**
- ✅ Receber webhooks do Postal MTA
- ✅ Validar assinatura (HMAC)
- ✅ Normalizar eventos (delivery, bounce, complaint, open, click)
- ✅ Enfileirar para processamento assíncrono
- ✅ Processar 5 tipos de eventos diferentes

**Endpoints:**
```
POST /webhooks/postal
  Recebe webhooks do Postal
  Responde imediatamente (200 OK)
  Enfileira para processamento assíncrono
```

**Eventos Suportados:**
```typescript
- MessageDelivered → delivery
- MessageBounced → bounce (com DSN parsing)
- MessageComplaint → complaint (com ARF parsing)
- MessageOpened → open (tracking)
- MessageClicked → click (tracking com URL)
```

---

### Semana 5-6: Sistema de Supressão ✅

**Arquivos:**
- `apps/api/src/modules/suppression/suppression.service.ts` - Serviço completo
- `apps/api/src/modules/suppression/dto/add-suppression.dto.ts` - DTO adicionar
- `apps/api/src/modules/suppression/dto/import-suppression.dto.ts` - DTO importar

**Funcionalidades:**
- ✅ Adicionar email à lista de supressão
- ✅ Verificar se email está suprimido
- ✅ Suporte a supressões globais e por empresa
- ✅ Detecção automática de contas de role (admin@, info@, etc)
- ✅ Importação em massa com validação
- ✅ Expiração automática de soft bounces
- ✅ Limpeza de supressões expiradas

**Tabela de Banco de Dados:**
```prisma
model Suppression {
  id            String              @id @default(cuid())
  companyId     String?             @map("company_id") // null = global
  email         String              @db.VarChar(254)
  domain        String?             @db.VarChar(253)
  reason        SuppressionReason   // HARD_BOUNCE, SPAM_COMPLAINT, etc
  source        String?             // bounce, complaint, manual
  bounceType    String?             // PERMANENT, TRANSIENT
  diagnosticCode String?
  suppressedAt  DateTime            @default(now())
  expiresAt     DateTime?           // Para soft bounces
  
  @@unique([companyId, email])
  @@index([reason, suppressedAt])
  @@index([domain, reason])
}
```

**API Endpoints:**
```typescript
POST   /v1/suppressions           # Adicionar email
GET    /v1/suppressions           # Listar suppressões
DELETE /v1/suppressions/:id       # Remover supressão
POST   /v1/suppressions/check     # Verificar email
POST   /v1/suppressions/import    # Importar lista (CSV/JSON)
```

---

### Semana 7-8: Reputação & Guardrails ✅

**Arquivos:**
- `apps/worker/src/services/reputation-monitor.service.ts` - Monitoramento
- `apps/worker/src/reputation-calculator-worker.ts` - Worker cron

**Funcionalidades:**
- ✅ Calcular métricas em tempo real (bounce rate, complaint rate, etc)
- ✅ Aplicar guardrails automáticos:
  - Bounce rate ≥ 2% → Pausa envios
  - Complaint rate ≥ 0.1% → Pausa envios
  - Reputation score < 50 → Pausa crítica
- ✅ Score de reputação (0-100)
- ✅ Salvar métricas diárias
- ✅ Alertas automáticos
- ✅ Throttling por warm-up

**Guardrails (Thresholds):**
```typescript
BOUNCE_RATE_THRESHOLD = 0.02       // 2%
COMPLAINT_RATE_THRESHOLD = 0.001   // 0.1%
REPUTATION_SCORE_CRITICAL = 50     // Score < 50
```

**Tabela de Banco de Dados:**
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
  bouncedHard     Int      @default(0)
  bouncedSoft     Int      @default(0)
  complained      Int      @default(0)
  opened          Int      @default(0)
  clicked         Int      @default(0)
  
  // Taxas calculadas
  bounceRate      Float    @default(0)
  complaintRate   Float    @default(0)
  openRate        Float    @default(0)
  clickRate       Float    @default(0)
  reputationScore Float    @default(100)
  
  @@unique([companyId, domainId, ipPoolId, date])
}
```

**Cron Job:**
```typescript
// Roda a cada 1 hora
ReputationCalculatorWorker.process()
  ✅ Calcula métricas para todas empresas
  ✅ Aplica guardrails
  ✅ Salva métrica diária
  ✅ Limpa supressões expiradas
```

---

### Semana 9-10: Tracking Opens/Clicks ✅

**Funcionalidades (no WebhookIngestWorker):**
- ✅ Rastrear aberturas de email (pixel tracking)
- ✅ Rastrear cliques em links
- ✅ Capturar user agent e IP
- ✅ Contar múltiplas aberturas/cliques
- ✅ Armazenar lista de URLs clicadas

**Tabela de Banco de Dados:**
```prisma
model EmailTracking {
  id            String   @id @default(cuid())
  emailLogId    String   @map("email_log_id")
  trackingId    String   @unique @db.VarChar(64)
  
  openedAt      DateTime?
  openCount     Int       @default(0)
  clickedAt     DateTime?
  clickCount    Int       @default(0)
  clickedUrls   Json?     // Array de { url, timestamp }
  
  userAgent     String?   @db.Text
  ipAddress     String?   @db.VarChar(45)
  
  @@index([emailLogId])
  @@index([trackingId])
}
```

**Eventos Processados:**
```typescript
- MessageOpened → Incrementa openCount
- MessageClicked → Incrementa clickCount, adiciona URL
- Múltiplas aberturas/cliques suportadas
```

---

### Semana 11: Warmup Scheduler ✅

**Arquivo:**
- `apps/worker/src/services/warmup-scheduler.service.ts`

**Funcionalidades:**
- ✅ Calcular limite diário de warm-up
- ✅ Escalamento gradual automático (exponencial)
- ✅ Progressão padrão: 50 → 100 → 200 → 400... (50% aumento/dia)
- ✅ Completar automaticamente após N dias
- ✅ Status e progresso de warm-up
- ✅ Recomendações automáticas

**Exemplo de Progressão:**
```
Dia 1:  50 emails
Dia 2:  75 emails (50% aumento)
Dia 3:  112 emails
Dia 4:  168 emails
Dia 5:  252 emails
...
Dia 30: Max 100.000 emails (ou configurado)
```

**API Methods:**
```typescript
getDailyLimit(domainId)           // Limite para hoje
getHourlyLimit(domainId)          // Distribuir em 24h
startWarmup(domainId, config)     // Iniciar warm-up
pauseWarmup(domainId)             // Pausar
resumeWarmup(domainId)            // Retomar (reset contador)
completeWarmup(domainId)          // Finalizar (production ready)
getWarmupStatus(domainId)         // Status atual
```

---

## 🗄️ Banco de Dados - Novos Modelos

### Enums Adicionados

```prisma
enum EmailProvider {
  AWS_SES
  POSTAL_SMTP
  POSTAL_API
  MAILU_SMTP
  HARAKA_API
  CUSTOM_SMTP
}

enum SuppressionReason {
  HARD_BOUNCE
  SOFT_BOUNCE
  SPAM_COMPLAINT
  UNSUBSCRIBE
  ROLE_ACCOUNT
  BAD_DOMAIN
  MANUAL
}

enum RateLimitScope {
  MX_DOMAIN
  CUSTOMER_DOMAIN
  IP_ADDRESS
  GLOBAL
}

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

### Tabelas Criadas

```
✅ suppressions          - Listas de supressão (global + por empresa)
✅ reputation_metrics    - Métricas diárias de reputação
✅ email_tracking       - Rastreamento de opens/clicks
✅ rate_limits          - Limites de rate limiting
✅ ip_pools             - Gerenciamento de IP pools
✅ dns_records          - Registros DNS para verificação
✅ domain_onboarding    - Status de onboarding de domínios
```

---

## 🔄 Fluxo de Processamento

### Webhook Postal → Email Log Update

```
1. Postal envia webhook
   ↓
2. PostalWebhookController recebe
   ├─ Valida assinatura (HMAC)
   ├─ Parse evento (delivery, bounce, complaint, open, click)
   └─ Enfileira para WebhookIngestWorker
   ↓
3. WebhookIngestWorker processa
   ├─ Encontra email_log pelo messageId
   │
   ├─ Se delivery:
   │  └─ Marca como SENT com timestamp
   │
   ├─ Se bounce:
   │  ├─ Parse DSN (RFC 3464)
   │  ├─ Classifica bounce (hard/soft/transient)
   │  ├─ Atualiza email_log
   │  ├─ Adiciona à suppression (se hard bounce)
   │  └─ Trigger webhook cliente
   │
   ├─ Se complaint:
   │  ├─ Parse ARF (RFC 5965)
   │  ├─ Extrai feedback type
   │  ├─ Adiciona à suppression
   │  └─ Trigger webhook cliente
   │
   ├─ Se open:
   │  ├─ Cria/atualiza EmailTracking
   │  ├─ Incrementa openCount
   │  └─ Trigger webhook cliente
   │
   └─ Se click:
      ├─ Cria/atualiza EmailTracking
      ├─ Incrementa clickCount
      ├─ Adiciona URL à lista
      └─ Trigger webhook cliente
   ↓
4. ReputationCalculatorWorker (a cada 1h)
   ├─ Calcula métricas (bounce rate, complaint rate, etc)
   ├─ Aplica guardrails (pausa se necessário)
   ├─ Salva ReputationMetric diária
   └─ Limpa supressões expiradas
```

---

## 🛠️ Como Usar

### 1. Adicionar Email à Supressão

```bash
curl -X POST http://localhost:3000/v1/suppressions \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "bounced@example.com",
    "reason": "HARD_BOUNCE",
    "source": "bounce",
    "bounceType": "PERMANENT"
  }'
```

### 2. Verificar se Email está Suprimido

```bash
curl http://localhost:3000/v1/suppressions/check?email=bounced@example.com \
  -H "X-API-Key: your-key"
```

Response:
```json
{
  "suppressed": true,
  "reason": "HARD_BOUNCE",
  "expiresAt": null
}
```

### 3. Importar Lista de Supressões

```bash
curl -X POST http://localhost:3000/v1/suppressions/import \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "emails": [
      "blocked1@example.com",
      "blocked2@example.com",
      "blocked3@example.com"
    ],
    "reason": "SPAM_COMPLAINT",
    "source": "import"
  }'
```

### 4. Iniciar Warm-up para Domínio

```typescript
// No código
const warmupScheduler = app.get(WarmupSchedulerService);

await warmupScheduler.startWarmup(domainId, {
  startVolume: 50,
  maxDailyVolume: 100000,
  dailyIncrease: 1.5, // 50% aumento/dia
  maxDays: 30,
});
```

### 5. Obter Status de Warm-up

```typescript
const status = await warmupScheduler.getWarmupStatus(domainId);

console.log(`
  Dias desde início: ${status.daysSinceStart}
  Limite atual: ${status.currentLimit}
  Progresso: ${status.progressPercentage.toFixed(1)}%
  Conclusão estimada: ${status.estimatedCompletionDate}
`);
```

---

## 📊 Métricas & Monitoring

### Métricas Capturadas (por empresa, por dia)

```typescript
interface ReputationMetrics {
  sent: number;              // Total enviado
  delivered: number;         // Total entregue
  bounced: number;           // Total bounce
  bouncedHard: number;       // Hard bounces
  bouncedSoft: number;       // Soft bounces
  complained: number;       // Reclamações
  opened: number;            // Aberturas
  clicked: number;           // Cliques
  
  // Taxas calculadas
  bounceRate: number;        // bounced / sent
  complaintRate: number;     // complained / sent
  openRate: number;          // opened / sent
  clickRate: number;         // clicked / sent
  
  // Score
  reputationScore: number;   // 0-100
}
```

### Dashboard Queries (próximas fases)

```sql
-- Reputação por empresa
SELECT * FROM reputation_metrics
WHERE company_id = $1
ORDER BY date DESC
LIMIT 30;

-- Warm-ups ativos
SELECT * FROM domains
WHERE warmup_enabled = true
ORDER BY warmup_start_date DESC;

-- Supressões por razão
SELECT reason, COUNT(*) as count
FROM suppressions
WHERE company_id = $1
GROUP BY reason;

-- Emails rastreados
SELECT COUNT(*), AVG(open_count), AVG(click_count)
FROM email_tracking
WHERE created_at >= NOW() - INTERVAL '7 days';
```

---

## 🧪 Testes Implementados

**Testes Unitários:**
```bash
npm test -- dsn-parser.service.spec.ts
npm test -- arf-parser.service.spec.ts
npm test -- bounce-classifier.service.spec.ts
```

**Payloads de Teste:**
```
test-payloads/
├── dsn-hard-bounce.txt
├── dsn-soft-bounce.txt
├── arf-spam-complaint.txt
├── postal-delivery.json
├── postal-bounce.json
├── postal-complaint.json
├── postal-open.json
└── postal-click.json
```

---

## 🔐 Segurança

### Validações Implementadas

- ✅ Validação de email (RFC 5322)
- ✅ Validação de signature (HMAC-SHA256)
- ✅ Timestamp validation (replay attacks)
- ✅ Input sanitization
- ✅ Role account detection

### Enriptação

- ✅ Private keys DKIM (encrypted at rest)
- ✅ Secrets via environment variables
- ✅ API key hashing

---

## 📈 Performance

### Índices de Banco de Dados

```prisma
// Suppressions
@@unique([companyId, email])
@@index([reason, suppressedAt])
@@index([domain, reason])

// Reputation Metrics
@@unique([companyId, domainId, ipPoolId, date])
@@index([date, companyId])

// Email Tracking
@@index([emailLogId])
@@index([trackingId])

// Email Logs (existente, expandido)
@@index([companyId, status])
@@index([bounceType, createdAt])
```

### Otimizações

- ✅ Queries em paralelo (Promise.all)
- ✅ Índices de banco de dados
- ✅ Paginação (skip/take)
- ✅ Processamento assíncrono via workers

---

## 🚀 Próximas Fases

### Track 1 Integração
- Usar `ReputationMonitorService` no driver de envio
- Consultar `WarmupSchedulerService` antes de enviar

### Track 3 Integração
- Dashboard com gráficos de reputação
- Exportar métricas para analytics

### Fase 2 (Opcional)
- Suporte a Mailu e Haraka webhooks
- Gmail Postmaster ingest
- MS SNDS integration
- DMARC report parsing

---

## 📚 Referências

### RFCs Implementadas
- **RFC 3464** - Delivery Status Notifications (DSN)
- **RFC 5965** - Abuse Reporting Format (ARF)
- **RFC 3463** - SMTP Enhanced Status Codes

### Documentação Externa
- Postal Docs: https://docs.postalserver.io/
- NestJS: https://docs.nestjs.com/

---

## ✅ Checklist de Validação

- [x] Parsers DSN/ARF funcionando
- [x] Webhooks Postal recebendo e processando
- [x] Supressões global + por empresa
- [x] Reputação monitorando e aplicando guardrails
- [x] Warm-up escalando automaticamente
- [x] Tracking de opens/clicks
- [x] Banco de dados com todas as tabelas
- [x] Testes unitários
- [x] Documentação completa
- [x] Type-safe com TypeScript
- [x] Tratamento de erros robusto
- [x] Logging em todos os serviços

---

**Track 2 - 100% COMPLETA** ✅🎉

Pronto para integração com Tracks 1 e 3!
