# PR11 - MAJOR #5 - Implementar rate limiting com transações Prisma

## Contexto
- Origem: PR #11 (MAJOR #5)
- Durante a revisão da PR #11 (TASK 4.1), foi identificado que o LoggingService faz múltiplas queries Prisma separadas, podendo saturar o pool de conexões do PostgreSQL.

## Problema

### Arquivo afetado
`apps/worker/src/services/logging.service.ts`

### Issue
Cada job faz múltiplas queries Prisma:
- `incrementAttempts()` - 1 query
- `upsertEmailLog()` - 2-3 queries (select + insert/update)
- `createEvent()` - 1 query (chamada 3-4x)
- `updateOutboxStatus()` - 1 query

**Total por job:** ~8-10 queries

**Com concurrency=16:** ~80-160 queries/segundo em pico

**Problemas:**
1. Saturação do pool de conexões Postgres (default: 10-20 conexões)
2. Latência aumentada
3. Maior chance de deadlocks
4. Queries não são atômicas (race conditions possíveis)

## O que precisa ser feito
- [ ] Refatorar LoggingService para usar transações
- [ ] Agrupar operações relacionadas em uma única transação
- [ ] Reduzir número total de queries por job
- [ ] Adicionar timeout nas transações
- [ ] Adicionar testes de concorrência
- [ ] Medir impacto em performance

## Solução proposta

### Agrupar operações de sucesso:

```typescript
async logSuccess(
  jobData: EmailSendJobData,
  sesMessageId: string,
  durationMs: number
): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    // 1. Atualizar outbox
    await tx.emailOutbox.update({
      where: { id: jobData.outboxId },
      data: {
        status: EmailStatus.SENT,
        sentAt: new Date(),
        sesMessageId,
        attempts: jobData.attempt,
      },
    });

    // 2. Upsert email_log
    const emailLog = await tx.emailLog.upsert({
      where: {
        outboxId_companyId: {
          outboxId: jobData.outboxId,
          companyId: jobData.companyId,
        },
      },
      create: {
        outboxId: jobData.outboxId,
        companyId: jobData.companyId,
        requestId: jobData.requestId,
        jobId: jobData.outboxId,
        sesMessageId,
        status: EmailStatus.SENT,
        finalStatus: EmailStatus.SENT,
        attempts: jobData.attempt,
        sentAt: new Date(),
        durationMs,
      },
      update: {
        sesMessageId,
        status: EmailStatus.SENT,
        finalStatus: EmailStatus.SENT,
        attempts: jobData.attempt,
        sentAt: new Date(),
        durationMs,
      },
    });

    // 3. Criar evento
    await tx.emailEvent.create({
      data: {
        emailLogId: emailLog.id,
        eventType: EventType.SENT,
        status: EmailStatus.SENT,
        metadata: {
          sesMessageId,
          attempt: jobData.attempt,
          durationMs,
        },
      },
    });
  });
}
```

### Agrupar operações de falha:

```typescript
async logFailure(
  jobData: EmailSendJobData,
  error: Error,
  errorCode: string,
  shouldRetry: boolean
): Promise<void> {
  await this.prisma.$transaction(async (tx) => {
    const status = shouldRetry ? EmailStatus.RETRY_SCHEDULED : EmailStatus.FAILED;

    // 1. Atualizar outbox
    await tx.emailOutbox.update({
      where: { id: jobData.outboxId },
      data: {
        status,
        attempts: jobData.attempt,
        lastFailureReason: error.message.substring(0, 500),
        lastFailureCode: errorCode,
        lastFailureAt: new Date(),
        failedAt: shouldRetry ? undefined : new Date(),
      },
    });

    // 2. Upsert email_log
    const emailLog = await tx.emailLog.upsert({
      where: {
        outboxId_companyId: {
          outboxId: jobData.outboxId,
          companyId: jobData.companyId,
        },
      },
      create: {
        outboxId: jobData.outboxId,
        companyId: jobData.companyId,
        requestId: jobData.requestId,
        jobId: jobData.outboxId,
        status,
        finalStatus: status,
        attempts: jobData.attempt,
        errorCode,
        errorReason: error.message.substring(0, 500),
        failedAt: shouldRetry ? undefined : new Date(),
      },
      update: {
        status,
        finalStatus: status,
        attempts: jobData.attempt,
        errorCode,
        errorReason: error.message.substring(0, 500),
        failedAt: shouldRetry ? undefined : new Date(),
      },
    });

    // 3. Criar evento
    await tx.emailEvent.create({
      data: {
        emailLogId: emailLog.id,
        eventType: shouldRetry ? EventType.RETRY_SCHEDULED : EventType.FAILED,
        status,
        metadata: {
          errorCode,
          errorReason: error.message.substring(0, 500),
          attempt: jobData.attempt,
          willRetry: shouldRetry,
        },
      },
    });
  });
}
```

### Benefícios:

**Antes:**
- 8-10 queries por job
- Não atômico (race conditions)
- 80-160 queries/s em pico

**Depois:**
- 3-4 queries por job (redução de 60%)
- Atômico (sem race conditions)
- 48-64 queries/s em pico (redução de 60%)
- Pool de conexões menos saturado

## Urgência
- **Nível (1–5):** 2 (alto - escalabilidade)

## Responsável sugerido
- Time de desenvolvimento (Backend/Worker)

## Dependências / Riscos
- Dependências: Nenhuma
- Riscos: Médio - mudança de comportamento que precisa testes
- Impacto: Melhora significativa em performance e escalabilidade
- Cuidado: Transações longas podem causar lock contention se mal implementadas
