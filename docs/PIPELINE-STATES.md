# Pipeline de Estados - Email Gateway Worker

**TASK 4.1** — Pipeline de estados, validações e envio SES

## Visão Geral

O worker implementa um pipeline de estados completo para processamento de emails, garantindo rastreabilidade, validações robustas e tratamento adequado de erros.

## Máquina de Estados

```
┌─────────────┐
│  RECEIVED   │  ← Job recebido do BullMQ
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  VALIDATED  │  ← Todas as validações passaram
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ SENT_ATTEMPT│  ← Tentando enviar ao AWS SES
└──────┬──────┘
       │
       ├──────────┬──────────┬─────────────┐
       ▼          ▼          ▼             ▼
┌──────────┐ ┌────────┐ ┌─────────────┐ ┌────────┐
│   SENT   │ │ FAILED │ │RETRY_SCHED │ │VALIDAT │
│          │ │        │ │            │ │FAILED  │
└──────────┘ └────────┘ └─────────────┘ └────────┘
  (sucesso)  (permanente) (transiente)  (validação)
```

## Estados do Pipeline

### 1. RECEIVED

**Descrição:** Job foi recebido do BullMQ e está iniciando o processamento.

**Ações:**

- Incrementa contador de tentativas no `email_outbox`
- Cria/atualiza registro no `email_logs`
- Registra evento `RECEIVED` no `email_events`

**Próximo estado:** `VALIDATED` (se validações passarem)

---

### 2. VALIDATED

**Descrição:** Todas as validações foram executadas com sucesso.

**Validações executadas:**

1. **INTEGRITY** - Validação do payload do job (Zod schema)
2. **OUTBOX** - Verificação de existência do registro em `email_outbox`
3. **RECIPIENT** - Validação dos dados do destinatário
4. **TEMPLATE** - Validação do HTML e subject

**Ações:**

- Registra evento `VALIDATED` no `email_events`
- Registra metadados das validações

**Próximo estado:** `SENT_ATTEMPT`

**Falha:** Se qualquer validação falhar → `VALIDATION_FAILED` (erro permanente)

---

### 3. SENT_ATTEMPT

**Descrição:** Tentativa de envio ao AWS SES em andamento.

**Ações:**

- Busca HTML do `email_outbox`
- Chama AWS SES `SendEmailCommand`
- Timeout de 30 segundos
- Registra evento `SENT_ATTEMPT`

**Próximos estados:**

- `SENT` - Envio bem-sucedido
- `FAILED` - Erro permanente (não será retentado)
- `RETRY_SCHEDULED` - Erro transiente (será retentado)

---

### 4a. SENT (Estado Final - Sucesso)

**Descrição:** Email enviado com sucesso ao AWS SES.

**Ações:**

- Atualiza `email_outbox.status = 'SENT'`
- Atualiza `email_outbox.processedAt`
- Cria/atualiza `email_logs`:
  - `status = 'SENT'`
  - `sesMessageId = <SES Message ID>`
  - `sentAt = now()`
  - `durationMs = <tempo total>`
- Registra evento `SENT` com:
  - `sesMessageId`
  - `durationMs`
  - `attempt`

**Job:** Marca como completed no BullMQ

---

### 4b. FAILED (Estado Final - Erro Permanente)

**Descrição:** Falha permanente que não será retentada.

**Causas comuns:**

- Validação falhou
- Erro de configuração (domínio não verificado)
- Email rejeitado (destinatário inválido)
- Conta SES pausada
- Máximo de tentativas atingido (5 tentativas)

**Ações:**

- Atualiza `email_outbox.status = 'FAILED'`
- Atualiza `email_outbox.lastError`
- Cria/atualiza `email_logs`:
  - `status = 'FAILED'`
  - `errorCode = <código do erro>`
  - `errorReason = <mensagem>`
  - `failedAt = now()`
- Registra evento `FAILED` com:
  - `errorCode`
  - `errorCategory`
  - `errorMessage`
  - `originalCode` (do SES)
  - `willRetry = false`

**Job:** Marca como failed no BullMQ (não move para DLQ ainda)

---

### 4c. RETRY_SCHEDULED (Estado Intermediário)

**Descrição:** Falha transiente, job será retentado.

**Causas comuns:**

- Throttling / Rate limit do SES
- Quota diária excedida
- Serviço SES temporariamente indisponível
- Timeout de rede
- Erro de conexão

**Ações:**

- Atualiza `email_outbox.status = 'RETRY_SCHEDULED'`
- Atualiza `email_outbox.lastError`
- Cria/atualiza `email_logs`:
  - `status = 'RETRY_SCHEDULED'`
  - `errorCode`
  - `errorReason`
  - `attempts = <contador>`
- Registra evento `RETRY_SCHEDULED` com:
  - `errorCode`
  - `willRetry = true`
  - `nextAttemptNumber`
  - `backoffDelay`

**Job:** Lança exceção para BullMQ reprocessar com backoff

**Backoff:** Exponencial com jitter (1s → 5s → 30s → 2min → 10min)

**Próximo estado:** Volta para `RECEIVED` na próxima tentativa

**Após 5 tentativas:** Move para `FAILED`

---

## Validações Detalhadas

### 1. INTEGRITY Validation

```typescript
validateEmailJobData(jobData)
```

**Verifica:**

- Todos os campos obrigatórios presentes
- Tipos corretos (UUID, email, string, number)
- Limites de tamanho respeitados
- `recipient.email === to`
- Pelo menos um ID do recipient presente

**Erro:** `INVALID_PAYLOAD` (permanente)

---

### 2. OUTBOX Validation

```typescript
await validateOutbox(jobData)
```

**Verifica:**

- Registro existe em `email_outbox` com `outboxId`
- `companyId` do job coincide com o do outbox

**Erro:** `OUTBOX_NOT_FOUND` (permanente)

---

### 3. RECIPIENT Validation

```typescript
await validateRecipient(jobData)
```

**Verifica:**

- Se `recipientId` fornecido:
  - Registro existe em `recipients`
  - Não foi deletado (`deletedAt IS NULL`)
  - `companyId` coincide
  - `email` coincide
- Formato de email válido (regex)

**Erro:** `RECIPIENT_NOT_FOUND` ou `INVALID_EMAIL` (permanente)

---

### 4. TEMPLATE Validation

```typescript
await validateTemplate(jobData)
```

**Verifica:**

- HTML existe no `email_outbox.html`
- HTML não está vazio
- Tamanho do HTML ≤ 512 KB
- Subject ≤ 150 caracteres
- HTML não contém scripts maliciosos:
  - `<script>` tags
  - `javascript:` URLs
  - Event handlers (`onclick`, etc.)

**Erro:** `INVALID_TEMPLATE` (permanente)

---

## Mapeamento de Erros SES

### Erros Permanentes (não retentáveis)

| Erro SES | Código Interno | Categoria |
|----------|---------------|-----------|
| `MessageRejected` | `SES_MESSAGE_REJECTED` | `PERMANENT_ERROR` |
| `MailFromDomainNotVerified` | `SES_MAIL_FROM_DOMAIN_NOT_VERIFIED` | `CONFIGURATION_ERROR` |
| `ConfigurationSetDoesNotExist` | `SES_CONFIGURATION_SET_DOES_NOT_EXIST` | `CONFIGURATION_ERROR` |
| `AccountSendingPausedException` | `SES_ACCOUNT_SENDING_PAUSED` | `PERMANENT_ERROR` |

### Erros Transientes (retentáveis)

| Erro SES | Código Interno | Categoria |
|----------|---------------|-----------|
| `Throttling` | `SES_THROTTLING` | `QUOTA_ERROR` |
| `MaxSendRateExceeded` | `SES_MAX_SEND_RATE_EXCEEDED` | `QUOTA_ERROR` |
| `DailyQuotaExceeded` | `SES_DAILY_QUOTA_EXCEEDED` | `QUOTA_ERROR` |
| `ServiceUnavailable` | `SES_SERVICE_UNAVAILABLE` | `TRANSIENT_ERROR` |
| `RequestTimeout` | `SES_TIMEOUT` | `TIMEOUT_ERROR` |
| `NetworkingError` | `NETWORK_ERROR` | `TRANSIENT_ERROR` |

---

## Gravação de Logs e Eventos

### email_logs

Registro principal do envio, contém:

```typescript
{
  outboxId: string          // PK, referência ao outbox
  companyId: string         // Tenant
  recipientId?: string      // Destinatário (se existir)
  to: string                // Email destino
  subject: string           // Assunto
  status: EmailStatus       // Estado final
  sesMessageId?: string     // ID do SES (se enviado)
  errorCode?: string        // Código de erro (se falhou)
  errorReason?: string      // Mensagem de erro (se falhou)
  attempts: number          // Número de tentativas
  durationMs?: number       // Tempo de processamento
  requestId: string         // ID de correlação
  createdAt: DateTime       // Timestamp de criação
  sentAt?: DateTime         // Timestamp de envio (se SENT)
  failedAt?: DateTime       // Timestamp de falha (se FAILED)
}
```

### email_events

Histórico de todos os eventos/transições:

```typescript
{
  emailLogId: string        // FK para email_logs
  type: EventType           // Tipo de evento
  metadata: JSON            // Metadados do evento
  createdAt: DateTime       // Timestamp
}
```

**Eventos criados:**

- `RECEIVED` - Job recebido
- `VALIDATED` - Validações passaram
- `VALIDATION_FAILED` - Validação falhou
- `SENT_ATTEMPT` - Tentativa de envio
- `SENT` - Enviado com sucesso
- `FAILED` - Falha permanente
- `RETRY_SCHEDULED` - Agendado para retry

---

## Correlação de IDs

Três IDs são usados para correlação:

1. **requestId** - ID da requisição HTTP original (`POST /v1/email/send`)
2. **jobId** - ID do job BullMQ (igual ao `outboxId`)
3. **sesMessageId** - ID da mensagem no AWS SES (quando enviado)

**Fluxo:**

```
HTTP Request → requestId
    ↓
email_outbox → outboxId (= jobId)
    ↓
BullMQ Job → jobId
    ↓
email_logs → outboxId + requestId
    ↓
AWS SES → sesMessageId
    ↓
email_logs → sesMessageId
```

---

## Retry e Backoff (Trilha 3.2)

### Configuração

```typescript
MAX_ATTEMPTS: 5
BACKOFF_DELAYS: [1s, 5s, 30s, 2min, 10min]
```

### Estratégia

- **Backoff exponencial** com **jitter** (±25%)
- Jitter previne "thundering herd" problem
- Após 5 tentativas → move para `FAILED`

### Implementação

```typescript
backoffStrategy: (attemptsMade: number) => {
  const baseDelay = BACKOFF_DELAYS[attemptsMade - 1]
  const jitter = baseDelay * 0.25
  const jitterAmount = Math.random() * jitter * 2 - jitter
  return baseDelay + jitterAmount
}
```

---

## Exemplo de Fluxo Completo

### Sucesso na primeira tentativa

```
1. RECEIVED (t=0ms)
   → Incrementa attempts
   → Cria email_log

2. VALIDATED (t=50ms)
   → Executa 4 validações
   → Todas passam

3. SENT_ATTEMPT (t=100ms)
   → Busca HTML
   → Chama SES

4. SENT (t=1200ms)
   → sesMessageId = "0100018c..."
   → Atualiza logs
   → Job completed
```

### Falha transiente com retry

```
Tentativa 1:
1. RECEIVED (t=0ms)
2. VALIDATED (t=50ms)
3. SENT_ATTEMPT (t=100ms)
   → SES retorna Throttling
4. RETRY_SCHEDULED (t=150ms)
   → Aguarda 1s + jitter

Tentativa 2 (após ~1.2s):
1. RECEIVED (t=0ms)
2. VALIDATED (t=50ms)
3. SENT_ATTEMPT (t=100ms)
   → SES sucesso
4. SENT (t=1100ms)
   → sesMessageId = "0100018c..."
```

### Falha permanente

```
1. RECEIVED (t=0ms)
2. VALIDATED (t=50ms)
   → Validação RECIPIENT falha
   → recipientId não encontrado

3. FAILED (t=80ms)
   → errorCode = RECIPIENT_NOT_FOUND
   → Job failed (não vai para DLQ ainda)
```

---

## Monitoramento

### Métricas Recomendadas

- `pipeline.state.transitions` - Counter de transições por estado
- `pipeline.validation.failures` - Counter de falhas por tipo de validação
- `pipeline.processing.duration` - Histogram de duração por estado
- `pipeline.retry.count` - Counter de retries por categoria de erro
- `pipeline.final.state` - Counter de estados finais (SENT/FAILED)

### Logs Estruturados

Todos os logs incluem:

- `outboxId`
- `requestId`
- `companyId`
- `attempt`
- `state`
- `durationMs`

---

## Referências

- **TASK 3.1** - Contrato do Job email:send
- **TASK 3.2** - Retry/backoff/DLQ e fairness
- **TASK 4.1** - Pipeline de estados, validações e envio SES
- **TASK 4.2** - Concorrência, fairness e desligamento gracioso
