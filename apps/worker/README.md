# Email Gateway Worker

Worker BullMQ responsável por processar jobs de envio de email através do AWS SES.

## TASK 4.1 — Pipeline de estados, validações e envio SES

### Funcionalidades Implementadas

✅ **Pipeline de Estados Completo**
- `RECEIVED` → `VALIDATED` → `SENT_ATTEMPT` → `SENT|FAILED|RETRY_SCHEDULED`
- Rastreamento completo de cada transição de estado
- Registro de eventos em `email_events`

✅ **Validações Robustas**
1. **INTEGRITY** - Validação do payload via Zod schema
2. **OUTBOX** - Verificação de existência no `email_outbox`
3. **RECIPIENT** - Validação de dados do destinatário
4. **TEMPLATE** - Validação de HTML e subject

✅ **Integração com AWS SES**
- Envio via AWS SDK v3 (`@aws-sdk/client-ses`)
- Timeout configurável (30s padrão)
- Tags para rastreamento
- Suporte a CC/BCC

✅ **Mapeamento de Erros SES → Taxonomia Interna**
- Classificação automática (permanente/transiente)
- Decisão inteligente de retry
- Logging estruturado de erros

✅ **Gravação de Logs e Eventos**
- `email_logs` - Registro principal com `requestId/jobId/messageId`
- `email_events` - Histórico completo de transições
- Correlação via `requestId`, `outboxId`, `sesMessageId`

✅ **Sistema de Ack/Retry (Trilha 3.2)**
- Backoff exponencial com jitter (1s → 60s)
- Máximo 5 tentativas antes de mover para FAILED
- DLQ automática via BullMQ

---

## Estrutura de Diretórios

```
apps/worker/src/
├── index.ts                      # Entry point principal
├── config/
│   ├── worker.config.ts          # Configuração do BullMQ
│   └── ses.config.ts             # Configuração do AWS SES
├── processors/
│   └── email-send.processor.ts   # Processador do job email:send
└── services/
    ├── validation.service.ts     # Validações do pipeline
    ├── logging.service.ts        # Gravação de logs/eventos
    ├── ses.service.ts            # Integração com AWS SES
    └── error-mapping.service.ts  # Mapeamento de erros SES
```

---

## Variáveis de Ambiente

### Obrigatórias

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/email_gateway"

# Redis
REDIS_HOST="localhost"
REDIS_PORT="6379"
REDIS_PASSWORD="" # Opcional

# AWS SES
AWS_REGION="us-east-1"              # ou AWS_SES_REGION
SES_FROM_ADDRESS="noreply@example.com"

# AWS Credentials (via AWS SDK)
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
```

### Opcionais

```bash
# Worker
WORKER_CONCURRENCY="16"             # Padrão: min(CPU*2, 16)

# SES
SES_REPLY_TO_ADDRESS="support@example.com"
SES_CONFIGURATION_SET_NAME="email-gateway"

# Redis
REDIS_DB="0"
```

---

## Instalação

```bash
# Instalar dependências
npm install

# Build
npm run build

# Desenvolvimento (hot reload)
npm run dev

# Produção
npm start
```

---

## Pipeline de Estados

Veja documentação completa em: [`/docs/PIPELINE-STATES.md`](../../docs/PIPELINE-STATES.md)

### Fluxo Normal

```
RECEIVED → VALIDATED → SENT_ATTEMPT → SENT
```

### Fluxo com Retry

```
RECEIVED → VALIDATED → SENT_ATTEMPT → RETRY_SCHEDULED
                                          ↓
                      ← ← ← ← ← ← ← ← ← ←
                      (aguarda backoff)
                                          ↓
RECEIVED → VALIDATED → SENT_ATTEMPT → SENT
```

### Fluxo de Erro Permanente

```
RECEIVED → VALIDATED → SENT_ATTEMPT → FAILED
```

---

## Validações

### 1. INTEGRITY Validation
Valida o payload do job usando Zod schema:
- Todos os campos obrigatórios presentes
- Tipos corretos
- `recipient.email === to`
- Pelo menos um ID do recipient

**Erro:** `INVALID_PAYLOAD`

---

### 2. OUTBOX Validation
Verifica existência no banco:
- Registro existe em `email_outbox`
- `companyId` coincide

**Erro:** `OUTBOX_NOT_FOUND`

---

### 3. RECIPIENT Validation
Valida dados do destinatário:
- Se `recipientId` fornecido, existe em `recipients`
- Não foi deletado (`deletedAt IS NULL`)
- Email em formato válido

**Erro:** `RECIPIENT_NOT_FOUND` ou `INVALID_EMAIL`

---

### 4. TEMPLATE Validation
Valida HTML e subject:
- HTML existe e não está vazio
- Tamanho ≤ 512 KB
- Subject ≤ 150 caracteres
- Sem scripts maliciosos

**Erro:** `INVALID_TEMPLATE`

---

## Mapeamento de Erros SES

### Erros Permanentes (não retentáveis)

| Código SES | Código Interno | Descrição |
|------------|----------------|-----------|
| `MessageRejected` | `SES_MESSAGE_REJECTED` | Mensagem rejeitada |
| `MailFromDomainNotVerified` | `SES_MAIL_FROM_DOMAIN_NOT_VERIFIED` | Domínio não verificado |
| `AccountSendingPausedException` | `SES_ACCOUNT_SENDING_PAUSED` | Conta pausada |

### Erros Transientes (retentáveis)

| Código SES | Código Interno | Descrição |
|------------|----------------|-----------|
| `Throttling` | `SES_THROTTLING` | Rate limit excedido |
| `DailyQuotaExceeded` | `SES_DAILY_QUOTA_EXCEEDED` | Quota diária excedida |
| `ServiceUnavailable` | `SES_SERVICE_UNAVAILABLE` | Serviço indisponível |

---

## Retry e Backoff

### Configuração
- **Máximo de tentativas:** 5
- **Backoff delays:** 1s → 5s → 30s → 2min → 10min
- **Jitter:** ±25% para evitar thundering herd

### Exemplo
```
Tentativa 1: Falha → aguarda ~1s
Tentativa 2: Falha → aguarda ~5s
Tentativa 3: Falha → aguarda ~30s
Tentativa 4: Falha → aguarda ~2min
Tentativa 5: Falha → FAILED (permanente)
```

---

## Concorrência e Fairness (TASK 4.2)

### Concorrência
- **Padrão:** `min(CPU * 2, 16)` workers
- **Configurável:** via `WORKER_CONCURRENCY`

### Limiter
- **Max in-flight:** 50 jobs por worker
- **Duration:** 1 segundo

### Fairness
Implementado via BullMQ groups (por tenant) - a ser implementado em TASK 4.2

---

## Desligamento Gracioso (TASK 4.2)

Ao receber `SIGTERM` ou `SIGINT`:

1. **Pausa o worker** - Para de aceitar novos jobs
2. **Aguarda jobs ativos** - Até 30 segundos
3. **Fecha conexões** - Worker e Prisma
4. **Exit limpo** - `process.exit(0)`

```typescript
SIGTERM recebido
  ↓
worker.pause()
  ↓
Aguarda até 30s para jobs terminarem
  ↓
worker.close()
  ↓
prisma.$disconnect()
  ↓
process.exit(0)
```

---

## Logs e Monitoramento

### Logs Estruturados
Todos os logs incluem:
- `outboxId` - ID do registro no outbox
- `requestId` - ID da requisição original
- `companyId` - Tenant
- `attempt` - Número da tentativa
- `state` - Estado atual do pipeline
- `durationMs` - Tempo de processamento

### Exemplo de Log
```
[EmailSendProcessor] SUCCESS: Email sent successfully.
  outboxId=abc123, sesMessageId=0100018c..., attempt=1, duration=1200ms
```

```
[EmailSendProcessor] RETRY: outboxId=xyz789,
  error=SES_THROTTLING, message="Rate limit exceeded",
  attempt=2/5, duration=150ms, willRetry=true
```

---

## Troubleshooting

### Worker não inicia
```bash
# Verifica variáveis de ambiente
env | grep -E "(DATABASE_URL|REDIS|AWS|SES)"

# Testa conexão com Redis
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping

# Testa conexão com Postgres
psql $DATABASE_URL -c "SELECT 1"
```

### Emails não são enviados
1. Verificar se domínio está verificado no SES
2. Verificar credenciais AWS
3. Verificar quota do SES
4. Verificar logs do worker

### Erros de validação
```bash
# Consultar falhas de validação
SELECT * FROM email_events
WHERE type = 'VALIDATION_FAILED'
ORDER BY created_at DESC;
```

---

## Testes

```bash
# Rodar todos os testes
npm test

# Testes com coverage
npm run test:cov

# Testes em watch mode
npm run test:watch
```

---

## Referências

- [Pipeline de Estados](../../docs/PIPELINE-STATES.md)
- [TASK 3.1 - Contrato do Job](../../../task/prompts_contextualizados_mvp_envio_boletos.md#task-31)
- [TASK 3.2 - Retry/Backoff/DLQ](../../../task/prompts_contextualizados_mvp_envio_boletos.md#task-32)
- [TASK 4.1 - Pipeline e Validações](../../../task/prompts_contextualizados_mvp_envio_boletos.md#task-41)
- [AWS SES Error Codes](https://docs.aws.amazon.com/ses/latest/dg/api-error-codes.html)
