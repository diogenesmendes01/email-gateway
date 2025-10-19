# 02-job-contracts

> **Tipo:** Queue/Redis
> **Status:** Aprovado
> **Última atualização:** 2025-10-19
> **Responsável:** Equipe de Arquitetura
> **Tarefa:** TASK 3.1 — Contrato do Job `email:send`

## Visão Geral

Este documento define o contrato completo do Job `email:send` processado pelo Worker através da fila BullMQ/Redis. O contrato garante comunicação consistente entre a API (produtor) e o Worker (consumidor), com foco em payload mínimo, idempotência e proteção de dados sensíveis.

## Índice

- [Visão Geral](#visão-geral)
- [Princípios do Contrato](#princípios-do-contrato)
- [Estrutura do Job](#estrutura-do-job)
- [Payload Detalhado](#payload-detalhado)
- [Opções de Configuração](#opções-de-configuração)
- [Garantias e Idempotência](#garantias-e-idempotência)
- [Privacidade e Segurança](#privacidade-e-segurança)
- [Exemplos de Uso](#exemplos-de-uso)
- [Validações](#validações)
- [Referências](#referências)

## Princípios do Contrato

### 1. Payload Mínimo

O job NÃO trafega o HTML completo do email. Apenas uma **referência** (`htmlRef`) que o Worker pode resolver:

- UUID do registro no banco de dados
- Path no storage (S3, filesystem, etc)
- Qualquer identificador que permita recuperar o HTML

**Benefícios:**
- Reduz tamanho do job em Redis (economia de memória)
- Evita timeout em jobs grandes
- Facilita migração de storage no futuro

### 2. jobId = outboxId

O `jobId` do BullMQ é **sempre igual** ao `outboxId` (UUID do registro em `email_outbox`).

**Garantias:**
- **Idempotência**: mesmo outbox nunca processado 2x
- **Rastreabilidade**: correlação direta entre job e registro no banco
- **Reprocessamento seguro**: retry não cria duplicatas

### 3. TTL de 24 Horas

Todo job tem **Time-To-Live de 24 horas** (86.400.000 ms).

**Comportamento:**
- Após 24h sem sucesso, o job **expira automaticamente**
- Jobs expirados são movidos para status `EXPIRED` no banco
- Evita jobs "órfãos" acumulando indefinidamente

### 4. PII Mínima e Criptografada

**CPF/CNPJ nunca trafegam em claro no job.**

- Apenas `cpfCnpjHash` (SHA-256) é incluído
- Dados sensíveis ficam no banco com criptografia
- Worker busca dados completos quando necessário

## Estrutura do Job

### Nome da Fila

```typescript
const QUEUE_NAME = 'email:send';
```

### Campos do Job

Um job BullMQ do tipo `email:send` contém:

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `data` | `EmailSendJobData` | ✅ | Payload do job |
| `opts` | `EmailSendJobOptions` | ✅ | Opções de configuração |

## Payload Detalhado

### EmailSendJobData

```typescript
interface EmailSendJobData {
  // Identificadores
  outboxId: string;          // UUID do email_outbox (= jobId)
  companyId: string;         // UUID da empresa (tenant)
  requestId: string;         // ID de correlação

  // Destinatários
  to: string;                // Email principal
  cc?: string[];             // CC (máx 5)
  bcc?: string[];            // BCC (máx 5)

  // Conteúdo
  subject: string;           // Assunto (1-150 chars)
  htmlRef: string;           // Referência ao HTML (não o HTML!)

  // Opcional
  replyTo?: string;          // Email de resposta
  headers?: Record<string, string>; // Headers customizados
  tags?: string[];           // Tags (máx 5)

  // Destinatário
  recipient: {
    recipientId?: string;    // UUID (se já existe)
    externalId?: string;     // ID no sistema do parceiro
    cpfCnpjHash?: string;    // Hash SHA-256 (nunca claro!)
    razaoSocial?: string;    // Razão social
    nome?: string;           // Nome
    email: string;           // Email (deve = to)
  };

  // Controle
  attempt: number;           // Número da tentativa (1-5)
  enqueuedAt: string;        // ISO 8601 timestamp
}
```

### Validações do Payload

1. **outboxId**: UUID válido
2. **companyId**: UUID válido
3. **to**: Email RFC válido, max 254 chars
4. **subject**: 1-150 chars, sem `\n`
5. **htmlRef**: string não-vazia
6. **recipient.email**: deve ser igual a `to`
7. **recipient**: ao menos um de `recipientId`, `externalId` ou `cpfCnpjHash`
8. **attempt**: 1-5 (conforme MAX_ATTEMPTS)
9. **enqueuedAt**: ISO 8601 válido

## Opções de Configuração

### EmailSendJobOptions

```typescript
interface EmailSendJobOptions {
  jobId: string;             // = outboxId (OBRIGATÓRIO)
  ttl: number;               // 86400000 ms (24h)
  priority?: number;         // 1-10 (default: 5)
  delay?: number;            // ms para atrasar processamento
  removeOnComplete?: boolean;// true (economiza memória)
  removeOnFail?: boolean;    // false (mantém para auditoria)
}
```

### Valores Padrão

```typescript
export const EMAIL_JOB_CONFIG = {
  QUEUE_NAME: 'email:send',
  DEFAULT_TTL: 86400000,        // 24 horas
  DEFAULT_PRIORITY: 5,          // Prioridade normal
  MAX_ATTEMPTS: 5,              // Máx tentativas
  BACKOFF_DELAYS: [1, 5, 30, 120, 600], // segundos
  DLQ_TTL: 604800000,           // 7 dias na DLQ
};
```

## Garantias e Idempotência

### 1. Garantia Pelo-Menos-Uma-Vez

BullMQ garante que cada job será processado **pelo menos uma vez**:

- Job não é removido até ACK explícito do worker
- Falhas causam requeue automático
- Redis AOF persiste jobs em disco

### 2. Idempotência via jobId = outboxId

```typescript
// Ao enfileirar
await emailQueue.add(
  'email:send',
  jobData,
  {
    jobId: jobData.outboxId,  // Garante unicidade
    ttl: 86400000,
    removeOnComplete: true
  }
);
```

**Comportamento:**
- Se job com mesmo `jobId` já existe: BullMQ **rejeita** a duplicata
- Se job foi completado: não é reprocessado
- Se job está ativo: não cria novo job

### 3. Deduplicação no Worker

Worker deve implementar check adicional:

```typescript
async function processEmailJob(job: Job<EmailSendJobData>) {
  const { outboxId } = job.data;

  // Check no banco se já foi processado
  const existingLog = await prisma.emailLog.findUnique({
    where: { outboxId },
  });

  if (existingLog?.status === 'SENT') {
    // Já enviado, apenas ACK
    return { status: 'ALREADY_SENT', sesMessageId: existingLog.sesMessageId };
  }

  // Processar normalmente...
}
```

## Privacidade e Segurança

### Regras de PII

**NUNCA** incluir no job:

- ❌ `cpfCnpj` em claro
- ❌ Dados bancários
- ❌ Senhas ou tokens

**SEMPRE** usar:

- ✅ `cpfCnpjHash` (SHA-256)
- ✅ `recipientId` (UUID)
- ✅ `externalId` (identificador opaco)

### Criptografia em Repouso

- Redis AOF deve usar criptografia de disco
- Backup de Redis deve ser criptografado
- Transport TLS entre API e Redis

### Masking em Logs

Worker deve fazer masking ao logar:

```typescript
logger.info('Processing email job', {
  jobId: job.id,
  outboxId: job.data.outboxId,
  to: maskEmail(job.data.to),           // user@example.com → u***@e***.com
  recipient: {
    cpfCnpjHash: job.data.recipient.cpfCnpjHash?.slice(0, 8) + '...',
    email: maskEmail(job.data.recipient.email),
  },
});
```

## Exemplos de Uso

### Exemplo 1: Enfileirar Job (API)

```typescript
import { emailSendJobDataSchema, EMAIL_JOB_CONFIG } from '@email-gateway/shared';

// 1. Criar payload
const jobData: EmailSendJobData = {
  outboxId: '123e4567-e89b-12d3-a456-426614174000',
  companyId: '789e4567-e89b-12d3-a456-426614174999',
  requestId: 'req-abc123',
  to: 'cliente@example.com',
  subject: 'Seu boleto está disponível',
  htmlRef: '123e4567-e89b-12d3-a456-426614174000', // UUID do HTML no banco
  recipient: {
    externalId: 'CUST-12345',
    cpfCnpjHash: 'a3c7b8d9e... (64 chars)',
    nome: 'João da Silva',
    email: 'cliente@example.com',
  },
  attempt: 1,
  enqueuedAt: new Date().toISOString(),
};

// 2. Validar
const validated = emailSendJobDataSchema.parse(jobData);

// 3. Enfileirar
await emailQueue.add(
  EMAIL_JOB_CONFIG.QUEUE_NAME,
  validated,
  {
    jobId: validated.outboxId,  // Idempotência
    ttl: EMAIL_JOB_CONFIG.DEFAULT_TTL,
    priority: 5,
    removeOnComplete: true,
    removeOnFail: false,
  }
);
```

### Exemplo 2: Processar Job (Worker)

```typescript
import { validateEmailJobData, EmailSendJobResult } from '@email-gateway/shared';

emailQueue.process('email:send', async (job) => {
  const startTime = Date.now();

  // 1. Validar payload
  const data = validateEmailJobData(job.data);

  // 2. Buscar HTML
  const html = await fetchHtmlByRef(data.htmlRef);

  // 3. Resolver recipient
  const recipient = await upsertRecipient(data.companyId, data.recipient);

  // 4. Enviar via SES
  const sesResult = await sesClient.sendEmail({
    to: data.to,
    cc: data.cc,
    bcc: data.bcc,
    subject: data.subject,
    html,
    replyTo: data.replyTo,
  });

  // 5. Persistir log
  await prisma.emailLog.create({
    data: {
      id: data.outboxId,
      companyId: data.companyId,
      recipientId: recipient.id,
      sesMessageId: sesResult.MessageId,
      status: 'SENT',
      durationMs: Date.now() - startTime,
    },
  });

  // 6. Retornar resultado
  const result: EmailSendJobResult = {
    sesMessageId: sesResult.MessageId,
    status: 'SENT',
    processedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    attempt: data.attempt,
  };

  return result;
});
```

### Exemplo 3: Retry com Backoff

```typescript
// Configuração de retry no worker
emailQueue.process('email:send', {
  concurrency: 10,
  limiter: {
    max: 100,
    duration: 1000, // 100 jobs/segundo
  },
}, async (job) => {
  try {
    return await processEmail(job);
  } catch (error) {
    // Erros permanentes (não retentar)
    if (error.code === 'INVALID_EMAIL') {
      throw new Error('Permanent failure'); // Move para DLQ
    }

    // Erros temporários (retentar com backoff)
    if (job.attemptsMade < EMAIL_JOB_CONFIG.MAX_ATTEMPTS) {
      const backoffSeconds = EMAIL_JOB_CONFIG.BACKOFF_DELAYS[job.attemptsMade];
      await job.moveToFailed(error, true);
      await job.retry({ delay: backoffSeconds * 1000 });
    } else {
      // Máx tentativas atingido → DLQ
      throw new Error('Max attempts reached');
    }
  }
});
```

## Validações

### Schema Zod

Todos os campos são validados via Zod antes de enfileirar:

```typescript
import { emailSendJobDataSchema, validateEmailJobData } from '@email-gateway/shared';

// Validação básica
const parsed = emailSendJobDataSchema.parse(jobData);

// Validação com regras customizadas
const validated = validateEmailJobData(jobData);
```

### Regras Customizadas

A função `validateEmailJobData` adiciona:

1. **recipient.email = to**
   ```typescript
   if (parsed.recipient.email !== parsed.to) {
     throw new Error('recipient.email must match to');
   }
   ```

2. **Pelo menos um identificador**
   ```typescript
   if (!recipientId && !externalId && !cpfCnpjHash) {
     throw new Error('At least one recipient identifier required');
   }
   ```

## Referências

- [Prisma Schema](../../packages/database/prisma/schema.prisma) - Modelos de dados
- [Email Send Schema](../../packages/shared/src/schemas/email-send.schema.ts) - Schema da API
- [Worker Configuration](../worker/01-configuracao.md) - Configuração do Worker
- [Retry Strategy](../worker/02-retry-strategy.md) - Estratégia de retry
- [ADR-20250116-escolha-redis-queue](../adrs/ADR-20250116-escolha-redis-queue.md) - Por que Redis

## Glossário

**Job**: Unidade de trabalho enfileirada no BullMQ

**jobId**: Identificador único do job (= outboxId)

**outboxId**: UUID do registro em `email_outbox`

**htmlRef**: Referência ao HTML (não o HTML completo)

**cpfCnpjHash**: Hash SHA-256 do CPF/CNPJ normalizado

**TTL**: Time-To-Live (tempo máximo de vida do job)

**DLQ**: Dead Letter Queue (fila de jobs que falharam permanentemente)

**Backoff Exponencial**: Estratégia de retry com intervalos crescentes

**Idempotência**: Propriedade onde múltiplas execuções produzem mesmo resultado

**Pelo-Menos-Uma-Vez**: Garantia de que job será processado ao menos 1x

---

**Template version:** 1.0
**Last updated:** 2025-10-19
**TASK:** TASK 3.1 — Contrato do Job `email:send`
