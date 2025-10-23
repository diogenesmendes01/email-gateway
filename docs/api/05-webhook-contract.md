# 05-webhook-contract

> **Tipo:** API | Contrato
> **Status:** Em Revisão
> **Última atualização:** 2025-10-23
> **Responsável:** Equipe MVP Email Gateway

## Visão Geral

Este documento define o **contrato de webhooks** para notificações de eventos de email do MVP. Clientes podem configurar endpoints HTTPS para receber notificações assíncronas sobre mudanças de estado dos emails enviados.

## Índice

- [Visão Geral](#visão-geral)
- [Objetivos](#objetivos)
- [Contexto](#contexto)
- [1. Configuração de Webhook](#1-configuração-de-webhook)
- [2. Formato de Payload](#2-formato-de-payload)
- [3. Segurança: Assinatura HMAC](#3-segurança-assinatura-hmac)
- [4. Headers do Webhook](#4-headers-do-webhook)
- [5. Idempotência](#5-idempotência)
- [6. Ordenação de Eventos](#6-ordenação-de-eventos)
- [7. Retries e Backoff](#7-retries-e-backoff)
- [8. Dead Letter Queue (DLQ)](#8-dead-letter-queue-dlq)
- [9. Tipos de Eventos](#9-tipos-de-eventos)
- [10. Implementação no Cliente](#10-implementação-no-cliente)
- [11. Exemplos](#11-exemplos)
- [12. Troubleshooting](#12-troubleshooting)
- [Referências](#referências)

## Objetivos

Este documento tem como objetivos:

- Definir o contrato técnico de webhooks entre Email Gateway e clientes
- Especificar formato de payload, headers e segurança (HMAC)
- Documentar estratégia de retry, idempotência e ordenação
- Fornecer exemplos de implementação para consumidores de webhook

## Contexto

### Quem deve ler este documento?

- **Desenvolvedores de clientes:** Implementar recepção de webhooks
- **Arquitetos:** Entender fluxo de notificações assíncronas
- **DevOps/SRE:** Configurar endpoints e monitorar entregas
- **QA:** Validar comportamento de webhooks em testes

### Quando usar webhooks?

Webhooks são **opcionais** no MVP. Use webhooks quando:

- ✅ Necessita notificação em tempo real de mudanças de estado
- ✅ Prefere modelo push sobre polling da API REST
- ✅ Sistema do cliente tem endpoint HTTPS público disponível

**Alternativa:** Use `GET /v1/emails/{outboxId}` para polling periódico.

### MVP Constraints

- **Throughput:** Suporta até 2.000 webhooks/hora (mesmo limite de envio)
- **Latência:** Entrega de webhook em < 5s após mudança de estado (best-effort)
- **Timeout:** Requisições para cliente com timeout de 5 segundos
- **Retries:** Máximo 5 tentativas antes de ir para DLQ

---

## 1. Configuração de Webhook

### 1.1 Configuração por Empresa

Cada empresa parceira pode configurar **um webhook URL** no sistema. Configuração é feita via:

1. **Variável de ambiente** (MVP):
   ```bash
   WEBHOOK_URL_M2=https://m2.example.com/webhooks/email-gateway
   WEBHOOK_URL_CODEWAVE=https://codewave.example.com/api/webhooks
   WEBHOOK_URL_TRUSTCLOUD=https://trustcloud.example.com/hooks/emails
   WEBHOOK_SECRET_M2=whsec_abc123xyz...
   WEBHOOK_SECRET_CODEWAVE=whsec_def456uvw...
   ```

2. **Database configuration** (futuro):
   ```sql
   UPDATE companies
   SET webhook_url = 'https://m2.example.com/webhooks/email-gateway',
       webhook_secret = 'whsec_abc123xyz...',
       webhook_enabled = true
   WHERE company_id = 'm2';
   ```

### 1.2 Requisitos do Endpoint do Cliente

O endpoint configurado deve:

- ✅ **HTTPS obrigatório** (TLS 1.2+)
- ✅ Responder com **200-299** em caso de sucesso
- ✅ Responder em **< 5 segundos** (timeout)
- ✅ **Validar assinatura HMAC** (X-Signature header)
- ✅ Implementar **idempotência** por eventId
- ✅ Suportar **POST** com `Content-Type: application/json`

**Exemplo de endpoint:**
```
POST https://client.example.com/webhooks/email-gateway
Content-Type: application/json
X-Signature: sha256=abc123...
X-Event-Id: evt_01HQXYZ123ABC
X-Retry-Count: 0
X-Sent-At: 1706012345678
```

---

## 2. Formato de Payload

### 2.1 Estrutura Geral

```json
{
  "eventType": "email.sent",
  "eventId": "evt_01HQXYZ123ABC",
  "timestamp": "2025-01-23T14:30:00.123Z",
  "sequenceNumber": 1,
  "data": {
    "outboxId": "out_01HQABC789XYZ",
    "externalId": "BOL-M2-2025-00123",
    "companyId": "m2",
    "recipient": "j***@e***le.com",
    "status": "SENT",
    "messageId": "0102018d1234abcd-5678efgh-9012ijkl-0000-0000000000000-000000",
    "sentAt": "2025-01-23T14:30:00.000Z",
    "attempts": 1,
    "processingTimeMs": 1234
  }
}
```

### 2.2 Campos do Payload

#### Root Level

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `eventType` | string | Tipo do evento. Valores: `email.sent`, `email.failed`, `email.retry_scheduled` |
| `eventId` | string | ID único do evento (formato: `evt_[ulid]`). Use para idempotência. |
| `timestamp` | string | ISO 8601 com milissegundos (UTC). Momento em que o evento ocorreu. |
| `sequenceNumber` | integer | Número sequencial do evento para este `outboxId`. Começa em 1. |
| `data` | object | Dados específicos do evento (varia por tipo). |

#### Data Object (email.sent)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `outboxId` | string | ID interno do email (formato: `out_[ulid]`). |
| `externalId` | string | ID fornecido pelo cliente no envio. Pode ser null. |
| `companyId` | string | ID da empresa parceira. |
| `recipient` | string | **Email mascarado** para privacidade (ex: `j***@e***le.com`). |
| `status` | string | Status atual. Valores: `SENT`, `FAILED`, `RETRY_SCHEDULED`. |
| `messageId` | string | Message ID retornado pelo SES. Presente em `email.sent`. |
| `sentAt` | string | ISO 8601. Timestamp de envio bem-sucedido. Null em eventos não-sent. |
| `attempts` | integer | Número de tentativas de envio até agora. |
| `processingTimeMs` | integer | Tempo desde enqueue até entrega (ms). |

#### Data Object (email.failed)

```json
{
  "eventType": "email.failed",
  "eventId": "evt_01HQXYZ456DEF",
  "timestamp": "2025-01-23T14:35:00.456Z",
  "sequenceNumber": 3,
  "data": {
    "outboxId": "out_01HQABC789XYZ",
    "externalId": "BOL-M2-2025-00124",
    "companyId": "m2",
    "recipient": "invalid@nonexistent-domain.com",
    "status": "FAILED",
    "failureReason": "Recipient address rejected",
    "failureCode": "INVALID_RECIPIENT",
    "sesError": "MessageRejected",
    "attempts": 5,
    "failedAt": "2025-01-23T14:35:00.000Z"
  }
}
```

**Campos adicionais em `email.failed`:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `failureReason` | string | Descrição human-readable do erro. |
| `failureCode` | string | Código interno de erro. Ver [Taxonomia de Erros](#taxonomia-de-erros). |
| `sesError` | string | Código de erro original do AWS SES. |
| `failedAt` | string | ISO 8601. Timestamp da falha definitiva. |

#### Data Object (email.retry_scheduled)

```json
{
  "eventType": "email.retry_scheduled",
  "eventId": "evt_01HQXYZ789GHI",
  "timestamp": "2025-01-23T14:31:00.789Z",
  "sequenceNumber": 2,
  "data": {
    "outboxId": "out_01HQABC789XYZ",
    "externalId": "BOL-M2-2025-00123",
    "companyId": "m2",
    "recipient": "temp-fail@example.com",
    "status": "RETRY_SCHEDULED",
    "retryAttempt": 1,
    "nextRetryAt": "2025-01-23T14:32:00.000Z",
    "lastError": "Throttling: Rate exceeded",
    "attempts": 1
  }
}
```

**Campos adicionais em `email.retry_scheduled`:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `retryAttempt` | integer | Tentativa de retry atual (1-5). |
| `nextRetryAt` | string | ISO 8601. Quando o próximo retry será executado. |
| `lastError` | string | Último erro que causou o retry. |

---

## 3. Segurança: Assinatura HMAC

### 3.1 Por que HMAC?

A assinatura HMAC garante:

- ✅ **Autenticidade:** Webhook realmente veio do Email Gateway
- ✅ **Integridade:** Payload não foi modificado em trânsito
- ✅ **Não-repúdio:** Gateway não pode negar envio

### 3.2 Algoritmo

**HMAC-SHA256** usando secret compartilhado.

### 3.3 Geração da Assinatura (Email Gateway)

```typescript
// No Email Gateway (enviando webhook)
import * as crypto from 'crypto';

function generateSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

// Uso
const payloadString = JSON.stringify(webhookPayload);
const signature = generateSignature(payloadString, process.env.WEBHOOK_SECRET_M2);

await axios.post(webhookUrl, payloadString, {
  headers: {
    'Content-Type': 'application/json',
    'X-Signature': signature,
    'X-Event-Id': eventId,
    'X-Retry-Count': retryCount.toString(),
    'X-Sent-At': Date.now().toString(),
  },
});
```

### 3.4 Validação da Assinatura (Cliente)

```typescript
// No cliente (recebendo webhook)
import * as crypto from 'crypto';

function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')}`;

  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Uso em endpoint Express
app.post('/webhooks/email-gateway', (req, res) => {
  const signature = req.headers['x-signature'] as string;
  const payloadString = JSON.stringify(req.body);
  const secret = process.env.EMAIL_GATEWAY_WEBHOOK_SECRET;

  if (!verifySignature(payloadString, signature, secret)) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process webhook...
  res.status(200).json({ received: true });
});
```

**⚠️ IMPORTANTE:** Sempre use `crypto.timingSafeEqual()` para prevenir timing attacks.

### 3.5 Obtenção do Secret

**MVP:** Secret fornecido durante onboarding via comunicação segura (ex: 1Password, Bitwarden).

**Formato do Secret:**
```
whsec_[32_random_alphanumeric_chars]
Exemplo: whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

---

## 4. Headers do Webhook

### 4.1 Headers Enviados pelo Gateway

Toda requisição de webhook inclui os seguintes headers:

| Header | Tipo | Descrição | Exemplo |
|--------|------|-----------|---------|
| `Content-Type` | string | Sempre `application/json` | `application/json` |
| `X-Signature` | string | Assinatura HMAC-SHA256 do payload | `sha256=abc123...` |
| `X-Event-Id` | string | ID único do evento (para idempotência) | `evt_01HQXYZ123ABC` |
| `X-Retry-Count` | string | Número de retries (0 na primeira tentativa) | `0`, `1`, `2`, ... |
| `X-Sent-At` | string | Timestamp Unix em millisegundos | `1706012345678` |
| `User-Agent` | string | Identificação do sender | `EmailGateway/1.0` |

### 4.2 Headers Esperados na Resposta (Cliente)

Cliente deve responder com:

| Header | Valor | Obrigatório |
|--------|-------|-------------|
| `Content-Type` | `application/json` | ❌ Opcional |
| Status Code | `200-299` | ✅ **Obrigatório** |

**Qualquer status code fora de 200-299 será considerado falha** e acionará retry.

---

## 5. Idempotência

### 5.1 Por que Idempotência?

Retries podem causar **entrega duplicada** de eventos. Cliente **DEVE** implementar idempotência para evitar processar o mesmo evento múltiplas vezes.

### 5.2 Chave de Idempotência

Use **`eventId`** (campo root do payload) como chave de deduplicação.

**Implementação recomendada:**

```typescript
// Database schema (PostgreSQL)
CREATE TABLE webhook_events_received (
  event_id VARCHAR(50) PRIMARY KEY,
  received_at TIMESTAMP DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE,
  payload JSONB NOT NULL
);

CREATE INDEX idx_webhook_events_received_at ON webhook_events_received(received_at);
```

```typescript
// Endpoint handler com idempotência
app.post('/webhooks/email-gateway', async (req, res) => {
  const { eventId, eventType, data } = req.body;

  try {
    // Tenta inserir evento no banco (falha se já existe)
    await db.query(
      'INSERT INTO webhook_events_received (event_id, payload) VALUES ($1, $2)',
      [eventId, JSON.stringify(req.body)]
    );

    // Evento novo, processar
    await processWebhookEvent(eventType, data);

    // Marcar como processado
    await db.query(
      'UPDATE webhook_events_received SET processed = true WHERE event_id = $1',
      [eventId]
    );

    res.status(200).json({ received: true, eventId });
  } catch (error) {
    if (error.code === '23505') {
      // Duplicate key (evento já recebido)
      console.log(`Duplicate event ${eventId}, ignoring`);
      return res.status(200).json({ received: true, duplicate: true });
    }

    // Erro real, retornar 500 para acionar retry
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**⚠️ IMPORTANTE:** Sempre retorne **200 OK** para eventos duplicados. Não retorne 4xx/5xx ou Gateway fará retry indefinidamente.

### 5.3 TTL de Idempotência

Recomendação: Manter registros de `eventId` por **30 dias**.

```sql
-- Cleanup job (executar diariamente)
DELETE FROM webhook_events_received
WHERE received_at < NOW() - INTERVAL '30 days';
```

---

## 6. Ordenação de Eventos

### 6.1 Garantias de Ordenação

**Ordenação é best-effort, NÃO garantida.**

Motivos:
- Retries podem causar eventos fora de ordem
- Processamento paralelo de workers
- Network jitter

### 6.2 Campo sequenceNumber

Cada evento inclui `sequenceNumber` incremental por `outboxId`:

```json
{
  "eventType": "email.retry_scheduled",
  "sequenceNumber": 1,  // Primeiro evento deste email
  ...
}
{
  "eventType": "email.sent",
  "sequenceNumber": 2,  // Segundo evento deste email
  ...
}
```

### 6.3 Reordenação no Cliente

**Cliente deve usar `sequenceNumber` + `timestamp` para ordenar eventos localmente:**

```typescript
// Buffer de eventos por outboxId
const eventBuffers = new Map<string, WebhookEvent[]>();

function processWebhook(event: WebhookEvent) {
  const { outboxId } = event.data;

  // Adicionar ao buffer
  if (!eventBuffers.has(outboxId)) {
    eventBuffers.set(outboxId, []);
  }
  eventBuffers.get(outboxId).push(event);

  // Ordenar por sequenceNumber
  const buffer = eventBuffers.get(outboxId).sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  // Processar eventos em ordem
  for (const evt of buffer) {
    applyStateTransition(evt);
  }
}
```

**⚠️ NOTA:** Implementar reordenação é opcional mas recomendado para transições de estado corretas.

---

## 7. Retries e Backoff

### 7.1 Quando Ocorre Retry?

Webhook é considerado **failed** se:

- ❌ Resposta com status code **não-2xx** (4xx, 5xx)
- ❌ Timeout após **5 segundos**
- ❌ Erro de rede (DNS failure, connection refused, TLS error)

### 7.2 Estratégia de Retry

**Backoff exponencial com 5 tentativas:**

| Tentativa | Delay | Tempo Acumulado |
|-----------|-------|-----------------|
| 1 (inicial) | 0s | 0s |
| 2 | 1 minuto | 1min |
| 3 | 5 minutos | 6min |
| 4 | 30 minutos | 36min |
| 5 | 2 horas | 2h 36min |
| 6 (final) | 24 horas | 26h 36min |

**Após 6ª tentativa:** Evento vai para **DLQ** (Dead Letter Queue).

### 7.3 Header X-Retry-Count

Cliente pode ver quantos retries foram feitos:

```http
X-Retry-Count: 0  # Primeira tentativa
X-Retry-Count: 3  # Quarta tentativa (após 3 retries)
```

### 7.4 Implementação no Gateway

```typescript
// BullMQ job configuration
await webhookQueue.add(
  'send-webhook',
  {
    eventId: 'evt_123',
    webhookUrl: 'https://client.com/webhooks',
    payload: webhookPayload,
    companyId: 'm2',
  },
  {
    attempts: 6,
    backoff: {
      type: 'custom',
      delays: [
        60 * 1000,        // 1 min
        5 * 60 * 1000,    // 5 min
        30 * 60 * 1000,   // 30 min
        2 * 60 * 60 * 1000,   // 2 hours
        24 * 60 * 60 * 1000,  // 24 hours
      ],
    },
    removeOnComplete: true,
    removeOnFail: false, // Keep for DLQ inspection
  }
);
```

---

## 8. Dead Letter Queue (DLQ)

### 8.1 O que é DLQ?

Webhooks que **falharam após todas as tentativas** vão para DLQ para análise manual.

### 8.2 Quando um Webhook vai para DLQ?

- ❌ Após 6 tentativas falhadas (26h+ de retries)
- ❌ Endpoint retornando consistentemente 4xx/5xx
- ❌ Timeout consistente (> 5s)

### 8.3 Inspeção de DLQ

**Comando Redis:**

```bash
# Listar jobs na DLQ (failed jobs)
redis-cli LRANGE bull:webhook-queue:failed 0 -1

# Inspecionar job específico
redis-cli HGETALL bull:webhook-queue:123456
```

**Via BullMQ Dashboard (Bull Board):**

```typescript
// apps/api/src/modules/monitoring/bull-board.ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(webhookQueue)],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());
```

Acesse: `http://localhost:3000/admin/queues`

### 8.4 Reprocessamento Manual

```typescript
// Retry all failed webhooks
const failedJobs = await webhookQueue.getFailed();

for (const job of failedJobs) {
  await job.retry();
}
```

### 8.5 Alertas de DLQ

**Prometheus Alert:**

```yaml
- alert: WebhookDLQHighVolume
  expr: bull_queue_failed_total{queue="webhook-queue"} > 100
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Webhook DLQ has > 100 failed jobs"
    description: "Check client endpoint availability and logs"
```

---

## 9. Tipos de Eventos

### 9.1 email.sent

**Quando:** Email foi enviado com sucesso pelo SES e aceito pelo servidor SMTP do destinatário.

**Payload:**
```json
{
  "eventType": "email.sent",
  "eventId": "evt_01HQXYZ123ABC",
  "timestamp": "2025-01-23T14:30:00.123Z",
  "sequenceNumber": 2,
  "data": {
    "outboxId": "out_01HQABC789XYZ",
    "externalId": "BOL-M2-2025-00123",
    "status": "SENT",
    "messageId": "0102018d1234abcd...",
    "sentAt": "2025-01-23T14:30:00.000Z",
    "attempts": 2,
    "processingTimeMs": 1234
  }
}
```

**Ação do Cliente:**
- Atualizar status do boleto para "enviado"
- Registrar `messageId` para rastreamento
- Notificar usuário final (opcional)

---

### 9.2 email.failed

**Quando:** Email falhou definitivamente após todas as tentativas de retry.

**Payload:**
```json
{
  "eventType": "email.failed",
  "eventId": "evt_01HQXYZ456DEF",
  "timestamp": "2025-01-23T14:35:00.456Z",
  "sequenceNumber": 3,
  "data": {
    "outboxId": "out_01HQABC789XYZ",
    "externalId": "BOL-M2-2025-00124",
    "status": "FAILED",
    "failureReason": "Recipient address rejected",
    "failureCode": "INVALID_RECIPIENT",
    "sesError": "MessageRejected",
    "attempts": 5,
    "failedAt": "2025-01-23T14:35:00.000Z"
  }
}
```

**Ação do Cliente:**
- Marcar boleto como "falha no envio"
- Notificar equipe de suporte
- Tentar envio alternativo (SMS, WhatsApp)

#### Taxonomia de Erros

| failureCode | Descrição | Ação Recomendada |
|-------------|-----------|------------------|
| `INVALID_RECIPIENT` | Email inválido ou rejeitado | Validar email com usuário |
| `BOUNCE_PERMANENT` | Bounce permanente (mailbox doesn't exist) | Remover email da lista |
| `BOUNCE_TEMPORARY` | Bounce temporário (mailbox full) | Tentar novamente depois |
| `COMPLAINT` | Usuário marcou como spam | Remover da lista (LGPD) |
| `SES_THROTTLE` | Rate limit do SES excedido | Aguardar, envio será retentado |
| `SES_ERROR` | Erro genérico do SES | Verificar logs |
| `INVALID_CONTENT` | HTML inválido ou muito grande | Corrigir template |
| `INTERNAL_ERROR` | Erro interno do Email Gateway | Contatar suporte |

---

### 9.3 email.retry_scheduled

**Quando:** Email falhou temporariamente e foi agendado para retry.

**Payload:**
```json
{
  "eventType": "email.retry_scheduled",
  "eventId": "evt_01HQXYZ789GHI",
  "timestamp": "2025-01-23T14:31:00.789Z",
  "sequenceNumber": 1,
  "data": {
    "outboxId": "out_01HQABC789XYZ",
    "externalId": "BOL-M2-2025-00123",
    "status": "RETRY_SCHEDULED",
    "retryAttempt": 1,
    "nextRetryAt": "2025-01-23T14:32:00.000Z",
    "lastError": "Throttling: Rate exceeded",
    "attempts": 1
  }
}
```

**Ação do Cliente:**
- (Opcional) Registrar retry para auditoria
- Aguardar próximo evento (será `email.sent` ou `email.failed`)

---

## 10. Implementação no Cliente

### 10.1 Checklist de Implementação

- [ ] **Endpoint HTTPS configurado** com certificado válido
- [ ] **Validação de assinatura HMAC** implementada
- [ ] **Idempotência por eventId** implementada (banco ou cache)
- [ ] **Response < 5s** (processar assíncronamente se necessário)
- [ ] **Retorna 200 OK** para eventos duplicados
- [ ] **Retorna 200 OK** apenas após processamento bem-sucedido
- [ ] **Logging** de todos os webhooks recebidos
- [ ] **Monitoramento** de taxa de falha
- [ ] **(Opcional) Reordenação** por sequenceNumber

### 10.2 Exemplo Completo (Node.js + Express)

```typescript
import express from 'express';
import crypto from 'crypto';
import { Pool } from 'pg';

const app = express();
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// IMPORTANTE: Raw body needed for signature validation
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf-8');
  },
}));

const WEBHOOK_SECRET = process.env.EMAIL_GATEWAY_WEBHOOK_SECRET;

app.post('/webhooks/email-gateway', async (req, res) => {
  const signature = req.headers['x-signature'] as string;
  const eventId = req.headers['x-event-id'] as string;
  const retryCount = parseInt(req.headers['x-retry-count'] as string, 10);
  const sentAt = parseInt(req.headers['x-sent-at'] as string, 10);

  // 1. Validate signature
  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest('hex')}`;

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    console.error(`[WEBHOOK] Invalid signature for event ${eventId}`);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 2. Idempotency check
  try {
    await db.query(
      'INSERT INTO webhook_events_received (event_id, payload, received_at) VALUES ($1, $2, NOW())',
      [eventId, JSON.stringify(req.body)]
    );
  } catch (error) {
    if (error.code === '23505') {
      // Duplicate event
      console.log(`[WEBHOOK] Duplicate event ${eventId}, skipping`);
      return res.status(200).json({ received: true, duplicate: true });
    }
    throw error;
  }

  // 3. Process webhook asynchronously
  const { eventType, data } = req.body;

  // Queue for async processing (recommended)
  await jobQueue.add('process-webhook', {
    eventId,
    eventType,
    data,
    retryCount,
    sentAt,
  });

  // 4. Return 200 immediately (webhook processed async)
  res.status(200).json({ received: true, eventId });
});

// Async processor (separate worker)
async function processWebhook(job) {
  const { eventId, eventType, data } = job.data;

  try {
    switch (eventType) {
      case 'email.sent':
        await handleEmailSent(data);
        break;
      case 'email.failed':
        await handleEmailFailed(data);
        break;
      case 'email.retry_scheduled':
        await handleEmailRetryScheduled(data);
        break;
      default:
        console.warn(`[WEBHOOK] Unknown event type: ${eventType}`);
    }

    // Mark as processed
    await db.query(
      'UPDATE webhook_events_received SET processed = true WHERE event_id = $1',
      [eventId]
    );

    console.log(`[WEBHOOK] Processed event ${eventId}`);
  } catch (error) {
    console.error(`[WEBHOOK] Error processing event ${eventId}:`, error);
    throw error; // Will trigger job retry
  }
}

async function handleEmailSent(data) {
  await db.query(
    'UPDATE boletos SET status = $1, sent_at = $2, message_id = $3 WHERE external_id = $4',
    ['SENT', data.sentAt, data.messageId, data.externalId]
  );
  console.log(`[WEBHOOK] Boleto ${data.externalId} marked as SENT`);
}

async function handleEmailFailed(data) {
  await db.query(
    'UPDATE boletos SET status = $1, failure_reason = $2 WHERE external_id = $3',
    ['FAILED', data.failureReason, data.externalId]
  );

  // Send alert to support team
  await sendSlackAlert(`⚠️ Email failed for ${data.externalId}: ${data.failureReason}`);
}

async function handleEmailRetryScheduled(data) {
  console.log(`[WEBHOOK] Boleto ${data.externalId} retry #${data.retryAttempt} scheduled for ${data.nextRetryAt}`);
}

app.listen(3001, () => console.log('Webhook endpoint running on port 3001'));
```

### 10.3 Exemplo com Reordenação

```typescript
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

async function processWebhookWithOrdering(event) {
  const { outboxId, sequenceNumber } = event.data;
  const bufferKey = `webhook:buffer:${outboxId}`;

  // Add event to buffer
  await redis.zadd(bufferKey, sequenceNumber, JSON.stringify(event));
  await redis.expire(bufferKey, 3600); // TTL 1 hour

  // Get all events for this outboxId, ordered by sequenceNumber
  const events = await redis.zrange(bufferKey, 0, -1);

  // Process in order
  for (const eventJson of events) {
    const evt = JSON.parse(eventJson);
    await processEvent(evt);
  }

  // Remove processed events
  await redis.zremrangebyscore(bufferKey, 0, sequenceNumber);
}
```

---

## 11. Exemplos

### 11.1 Fluxo Completo de Sucesso

```
Cliente                     Email Gateway                 Cliente Webhook
   |                              |                              |
   |--- POST /v1/email/send ----->|                              |
   |<-- 201 outboxId: out_123 ----|                              |
   |                              |                              |
   |                              |--- Enqueue job ------------->| (Redis)
   |                              |                              |
   |                              |--- Send via SES -----------→ | (AWS)
   |                              |<-- MessageId ----------------|
   |                              |                              |
   |                              |--- POST /webhooks -----------→|
   |                              |    {eventType: "email.sent"} |
   |                              |    X-Signature: sha256=...   |
   |                              |    X-Event-Id: evt_456       |
   |                              |                              |
   |                              |                              |--- Validate HMAC
   |                              |                              |--- Check eventId (not duplicate)
   |                              |                              |--- Process event
   |                              |<-- 200 OK -------------------|
   |                              |                              |
```

### 11.2 Fluxo com Retry

```
Cliente                     Email Gateway                 Cliente Webhook
   |                              |                              |
   |--- POST /v1/email/send ----->|                              |
   |<-- 201 outboxId: out_123 ----|                              |
   |                              |                              |
   |                              |--- POST /webhooks (retry=0)->|
   |                              |    {eventType: "email.sent"} |
   |                              |                              |
   |                              |<-- 500 Internal Error -------| (Client down)
   |                              |                              |
   |                              |--- Wait 1 minute ----------->|
   |                              |                              |
   |                              |--- POST /webhooks (retry=1)->|
   |                              |    X-Retry-Count: 1          |
   |                              |                              |
   |                              |<-- 200 OK -------------------| (Client recovered)
   |                              |                              |
```

### 11.3 Fluxo com Evento Duplicado

```
Cliente                     Email Gateway                 Cliente Webhook
   |                              |                              |
   |                              |--- POST /webhooks (retry=0)->|
   |                              |    X-Event-Id: evt_789       |
   |                              |                              |
   |                              |                              |--- INSERT event_id=789
   |                              |                              |--- Process event
   |                              |<-- 200 OK -------------------|
   |                              |                              |
   |                              |--- POST /webhooks (retry=1)->| (Retry desnecessário)
   |                              |    X-Event-Id: evt_789       |
   |                              |                              |
   |                              |                              |--- INSERT event_id=789 (FAIL: duplicate key)
   |                              |                              |--- Skip processing
   |                              |<-- 200 OK (duplicate) -------|
   |                              |                              |
```

---

## 12. Troubleshooting

### 12.1 Webhook não chega

**Sintomas:**
- Email enviado com sucesso (status SENT) mas webhook não recebido

**Possíveis causas:**
1. **Webhook não configurado:** Verificar `WEBHOOK_URL_<COMPANY>` em env vars
2. **Endpoint inacessível:** Verificar se URL está acessível publicamente (curl)
3. **Firewall bloqueando:** Whitelist de IPs do Email Gateway necessário

**Diagnóstico:**
```bash
# Verificar logs do Email Gateway
docker logs email-gateway-worker | grep "webhook.*evt_123"

# Testar endpoint manualmente
curl -X POST https://client.com/webhooks/email-gateway \
  -H "Content-Type: application/json" \
  -H "X-Signature: sha256=test" \
  -H "X-Event-Id: evt_test" \
  -d '{"eventType":"email.sent","data":{}}'
```

---

### 12.2 Webhook retorna 401 Unauthorized

**Sintomas:**
- Webhook consistentemente falhando com 401

**Possíveis causas:**
1. **Secret incorreto:** Gateway usando secret diferente do cliente
2. **Validação HMAC incorreta:** Implementação com bug no cliente

**Diagnóstico:**
```typescript
// No cliente, log signature comparison
console.log('Received signature:', req.headers['x-signature']);
console.log('Expected signature:', expectedSignature);
console.log('Raw body:', req.rawBody);
console.log('Secret:', WEBHOOK_SECRET);
```

**Soluções:**
- Verificar que secret está correto (`whsec_...`)
- Verificar que `req.rawBody` é a string JSON exata (não objeto parsed)
- Usar `crypto.timingSafeEqual()` para comparação

---

### 12.3 Webhook demora > 5s (timeout)

**Sintomas:**
- Webhook sendo retentado constantemente
- Logs: "Webhook timeout after 5000ms"

**Possíveis causas:**
1. **Processamento síncrono lento:** Cliente processando tudo no handler
2. **Database lock:** Query no webhook handler esperando lock
3. **Chamada externa:** Webhook fazendo API calls para terceiros

**Solução:**
```typescript
// ❌ ERRADO: Processamento síncrono
app.post('/webhooks', async (req, res) => {
  await heavyProcessing(req.body); // Pode levar minutos
  res.status(200).json({ ok: true });
});

// ✅ CORRETO: Enqueue e retorna rápido
app.post('/webhooks', async (req, res) => {
  await db.query('INSERT INTO webhook_events ...');
  await jobQueue.add('process-webhook', req.body); // Async
  res.status(200).json({ ok: true }); // < 100ms
});
```

---

### 12.4 Eventos chegando fora de ordem

**Sintomas:**
- `email.sent` chega antes de `email.retry_scheduled`
- `sequenceNumber` 2 processado antes de 1

**Causa:**
- Retries e processamento paralelo (comportamento esperado)

**Solução:**
- Implementar buffer de reordenação (ver seção 10.3)
- Usar `sequenceNumber` para ordenar
- Ignorar eventos com `sequenceNumber` menor que o último processado

---

### 12.5 DLQ crescendo sem parar

**Sintomas:**
- Métrica `bull_queue_failed_total` aumentando
- Bull Board mostrando centenas de failed jobs

**Possíveis causas:**
1. **Endpoint cliente down:** Manutenção, deploy, crash
2. **Certificate expirado:** TLS error ao conectar
3. **Rate limiting:** Cliente limitando requests do gateway

**Diagnóstico:**
```bash
# Listar failed jobs
redis-cli LRANGE bull:webhook-queue:failed 0 10

# Inspecionar error message
redis-cli HGET bull:webhook-queue:12345 failedReason
```

**Solução:**
- Corrigir endpoint do cliente
- Fazer retry manual via Bull Board
- Se persistir, desabilitar webhooks temporariamente:
  ```bash
  # Pausar queue
  redis-cli SET webhook:queue:paused true
  ```

---

## Referências

- [Pacote de Documentos de Arquitetura — MVP](docs/00-pacote-documentos-arquitetura-mvp.md)
- [API Contract - Email Send](docs/api/03-email-send-contract.md)
- [Acceptance Criteria](docs/testing/01-acceptance-criteria.md)
- [HMAC Signature Validation - Stripe](https://stripe.com/docs/webhooks/signatures)
- [Webhook Best Practices - Twilio](https://www.twilio.com/docs/usage/webhooks/webhooks-best-practices)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [RFC 2104 - HMAC](https://datatracker.ietf.org/doc/html/rfc2104)

---

**Template version:** 1.0
**Last updated:** 2025-10-23
