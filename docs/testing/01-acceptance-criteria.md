# 01-acceptance-criteria

> **Tipo:** Testing | Referência
> **Status:** Aprovado
> **Última atualização:** 2025-01-23
> **Responsável:** Equipe MVP Email Gateway

## Visão Geral

Este documento define os critérios de aceitação funcionais para o MVP de envio de boletos por e-mail. Serve como checklist de validação para garantir que o sistema atende aos requisitos de negócio antes do go-live.

## Índice

- [Visão Geral](#visão-geral)
- [Objetivos](#objetivos)
- [Contexto](#contexto)
- [Critérios Funcionais](#critérios-funcionais)
  - [1. Envio Idempotente](#1-envio-idempotente)
  - [2. Validações Negativas](#2-validações-negativas)
  - [3. Consulta por Filtros](#3-consulta-por-filtros)
  - [4. Webhooks (Quando Habilitados)](#4-webhooks-quando-habilitados)
- [Critérios Não-Funcionais](#critérios-não-funcionais)
- [Cenários de Teste](#cenários-de-teste)
- [Checklist de Aceitação](#checklist-de-aceitação)
- [Referências](#referências)

## Objetivos

Este documento tem como objetivos:

- Definir critérios claros de aceitação para validação do MVP
- Garantir cobertura de requisitos funcionais críticos
- Servir como checklist para testes de aceitação
- Documentar comportamentos esperados do sistema

## Contexto

### Quem deve ler este documento?

- QA/Testers responsáveis por validação
- Desenvolvedores implementando funcionalidades
- Product Owner validando entregas
- Stakeholders de negócio

### Escopo do MVP

**Volume:** 40k emails/mês (~1.300/dia)
**Parceiros:** 5 empresas (M2, CodeWave, TrustCloud, CertShift, Pixel)
**Throughput:** ≥ 2.000 envios/hora em pico
**Disponibilidade:** ≥ 99,5% (horário comercial)

---

## Critérios Funcionais

### 1. Envio Idempotente

**Objetivo:** Garantir que múltiplas requisições com mesmo `externalId` resultem em apenas um envio.

#### Critérios de Aceitação

**AC-001: Idempotência por externalId**

- **DADO** que envio um email com `externalId: "BOL-12345"`
- **QUANDO** faço uma segunda requisição com mesmo `externalId`
- **ENTÃO** o sistema deve:
  - Retornar **200 OK** (não 201)
  - Retornar o mesmo `outboxId` da primeira requisição
  - **NÃO criar** novo registro em `email_outbox`
  - **NÃO enfileirar** novo job no Redis
  - Logar evento de idempotência detectada

**AC-002: Idempotência com conteúdo diferente**

- **DADO** que envio um email com `externalId: "BOL-12345"`
- **QUANDO** faço segunda requisição com mesmo `externalId` mas conteúdo diferente
- **ENTÃO** o sistema deve:
  - Retornar **200 OK** com mesmo `outboxId`
  - **IGNORAR** novo conteúdo (manter original)
  - Logar warning de tentativa de modificação

**AC-003: Idempotência após timeout**

- **DADO** que uma requisição foi enviada mas não recebeu resposta (timeout)
- **QUANDO** cliente reenvia com mesmo `externalId`
- **ENTÃO** o sistema deve:
  - Identificar registro existente
  - Retornar status atual do envio
  - **NÃO duplicar** envio

**Validação Técnica:**

```typescript
// Test case
it('should enforce idempotency by externalId', async () => {
  const payload = {
    externalId: 'BOL-IDEMPOTENT-001',
    recipient: 'test@example.com',
    subject: 'Boleto',
    htmlContent: '<p>Test</p>',
  };

  const response1 = await request(app)
    .post('/v1/email/send')
    .set('X-API-Key', apiKey)
    .send(payload)
    .expect(201);

  const response2 = await request(app)
    .post('/v1/email/send')
    .set('X-API-Key', apiKey)
    .send(payload)
    .expect(200);

  expect(response1.body.outboxId).toBe(response2.body.outboxId);
});
```

---

### 2. Validações Negativas

**Objetivo:** Garantir que o sistema rejeita requisições inválidas com mensagens de erro claras.

#### Critérios de Aceitação

**AC-004: Validação de campos obrigatórios**

- **QUANDO** envio requisição **sem** `recipient`
- **ENTÃO** o sistema deve:
  - Retornar **400 Bad Request**
  - Retornar erro: `{ "code": "VALIDATION_ERROR", "field": "recipient", "message": "Recipient is required" }`
  - **NÃO persistir** nada no banco
  - **NÃO enfileirar** job

**AC-005: Validação de formato de email**

- **QUANDO** envio email com formato inválido: `"invalid-email"`
- **ENTÃO** o sistema deve:
  - Retornar **400 Bad Request**
  - Erro: `{ "code": "INVALID_EMAIL_FORMAT" }`

**AC-006: Validação de payload size**

- **QUANDO** envio HTML com **> 1MB** de tamanho
- **ENTÃO** o sistema deve:
  - Retornar **413 Payload Too Large**
  - Erro: `{ "code": "PAYLOAD_TOO_LARGE", "maxSize": "1MB", "actualSize": "1.5MB" }`

**AC-007: Validação de HTML malicioso**

- **QUANDO** envio HTML com scripts: `<script>alert('XSS')</script>`
- **ENTÃO** o sistema deve:
  - Retornar **400 Bad Request**
  - Erro: `{ "code": "INVALID_HTML", "reason": "Script tags not allowed" }`

**AC-008: Validação de API Key**

- **QUANDO** faço requisição **sem** header `X-API-Key`
- **ENTÃO** o sistema deve:
  - Retornar **401 Unauthorized**
  - Erro: `{ "code": "MISSING_API_KEY" }`

**AC-009: Validação de API Key inválida**

- **QUANDO** uso API Key expirada ou revogada
- **ENTÃO** o sistema deve:
  - Retornar **401 Unauthorized**
  - Erro: `{ "code": "INVALID_API_KEY" }`
  - Logar tentativa de acesso com key inválida

**AC-010: Validação de Rate Limit**

- **QUANDO** excedo **60 RPS** (burst 120) com mesma API Key
- **ENTÃO** o sistema deve:
  - Retornar **429 Too Many Requests**
  - Headers: `X-RateLimit-Limit: 60`, `X-RateLimit-Remaining: 0`, `X-RateLimit-Reset: <timestamp>`
  - Erro: `{ "code": "RATE_LIMIT_EXCEEDED" }`

**Validação Técnica:**

```typescript
// Test case
describe('Negative validations', () => {
  it('should reject missing recipient', async () => {
    await request(app)
      .post('/v1/email/send')
      .set('X-API-Key', apiKey)
      .send({ subject: 'Test' })
      .expect(400)
      .expect((res) => {
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.field).toBe('recipient');
      });
  });

  it('should reject oversized payload', async () => {
    const largePayload = {
      recipient: 'test@example.com',
      subject: 'Test',
      htmlContent: 'x'.repeat(2 * 1024 * 1024), // 2MB
    };

    await request(app)
      .post('/v1/email/send')
      .set('X-API-Key', apiKey)
      .send(largePayload)
      .expect(413);
  });
});
```

---

### 3. Consulta por Filtros

**Objetivo:** Permitir consulta de emails enviados com diversos filtros para operação e auditoria.

#### Critérios de Aceitação

**AC-011: Filtro por externalId**

- **QUANDO** consulto `GET /v1/emails?externalId=BOL-12345`
- **ENTÃO** o sistema deve:
  - Retornar **200 OK**
  - Retornar lista com todos emails que tenham `externalId` = "BOL-12345"
  - Incluir campos: `outboxId`, `recipient` (mascarado), `status`, `createdAt`, `sentAt`

**AC-012: Filtro por email hash**

- **QUANDO** consulto `GET /v1/emails?emailHash=<hash>`
- **ENTÃO** o sistema deve:
  - Buscar por hash HMAC-SHA256 do email
  - Retornar emails correspondentes
  - **NÃO retornar** email em plain text (apenas mascarado)

**AC-013: Filtro por CPF/CNPJ hash**

- **QUANDO** consulto `GET /v1/emails?cpfCnpjHash=<hash>`
- **ENTÃO** o sistema deve:
  - Buscar por hash HMAC-SHA256
  - Retornar emails correspondentes
  - CPF/CNPJ retornado **mascarado**: `123.***.***-01`

**AC-014: Filtro por status**

- **QUANDO** consulto `GET /v1/emails?status=SENT`
- **ENTÃO** o sistema deve:
  - Retornar apenas emails com `status = SENT`
  - Valores válidos: `PENDING`, `PROCESSING`, `SENT`, `FAILED`, `DLQ`

**AC-015: Filtro por período**

- **QUANDO** consulto `GET /v1/emails?dateFrom=2025-01-01&dateTo=2025-01-31`
- **ENTÃO** o sistema deve:
  - Retornar emails enviados entre as datas
  - Formato ISO 8601: `YYYY-MM-DD`
  - Timezone: UTC

**AC-016: Paginação por cursor**

- **QUANDO** consulto `GET /v1/emails?limit=50`
- **ENTÃO** o sistema deve:
  - Retornar até 50 registros
  - Incluir cursor na resposta: `{ "data": [...], "cursor": "base64...", "hasMore": true }`
  - Próxima página: `GET /v1/emails?cursor=base64...&limit=50`

**AC-017: Consulta por ID específico**

- **QUANDO** consulto `GET /v1/emails/{outboxId}`
- **ENTÃO** o sistema deve:
  - Retornar **200 OK** se existe
  - Retornar **404 Not Found** se não existe
  - Incluir eventos relacionados: `email_events` com timestamps

**AC-018: Performance de consultas**

- **QUANDO** faço consulta com filtros
- **ENTÃO** o sistema deve:
  - Responder em **< 500ms** (P95)
  - Usar índices otimizados
  - Limitar resultado a **1000 registros** por página

**Validação Técnica:**

```typescript
// Test case
describe('Query filters', () => {
  it('should filter by externalId', async () => {
    const response = await request(app)
      .get('/v1/emails')
      .set('X-API-Key', apiKey)
      .query({ externalId: 'BOL-12345' })
      .expect(200);

    expect(response.body.data).toBeArray();
    response.body.data.forEach((email) => {
      expect(email.externalId).toBe('BOL-12345');
    });
  });

  it('should support cursor pagination', async () => {
    const page1 = await request(app)
      .get('/v1/emails')
      .set('X-API-Key', apiKey)
      .query({ limit: 10 })
      .expect(200);

    expect(page1.body).toHaveProperty('cursor');
    expect(page1.body).toHaveProperty('hasMore');

    if (page1.body.hasMore) {
      const page2 = await request(app)
        .get('/v1/emails')
        .set('X-API-Key', apiKey)
        .query({ cursor: page1.body.cursor, limit: 10 })
        .expect(200);

      expect(page2.body.data).toBeArray();
    }
  });
});
```

---

### 4. Webhooks (Quando Habilitados)

**Objetivo:** Notificar clientes sobre eventos de envio quando webhooks estiverem configurados.

**Nota:** Webhooks são **opcionais** no MVP. Critérios aplicam-se quando cliente configurar webhook URL.

#### Critérios de Aceitação

**AC-019: Webhook de email enviado**

- **DADO** que cliente configurou `webhookUrl`
- **QUANDO** email é enviado com sucesso (status `SENT`)
- **ENTÃO** o sistema deve:
  - Fazer `POST` para `webhookUrl` com payload:

```json
{
  "eventType": "email.sent",
  "eventId": "evt_abc123",
  "timestamp": "2025-01-23T10:00:00Z",
  "data": {
    "outboxId": "out_xyz789",
    "externalId": "BOL-12345",
    "recipient": "u***@e***.com",
    "status": "SENT",
    "messageId": "ses_msg_id",
    "sentAt": "2025-01-23T10:00:00Z"
  }
}
```

  - Incluir header `X-Signature` (HMAC-SHA256)
  - Incluir headers: `X-Event-Id`, `X-Retry-Count`, `X-Sent-At`
  - Retry em caso de falha: 1m, 5m, 30m, 2h, 24h

**AC-020: Webhook de email falhado**

- **DADO** que cliente configurou `webhookUrl`
- **QUANDO** email falha definitivamente (status `FAILED` ou `DLQ`)
- **ENTÃO** o sistema deve:
  - Enviar webhook com `eventType: "email.failed"`
  - Incluir `failureReason` e `failureCode`

**AC-021: Idempotência de webhooks**

- **DADO** que webhook já foi enviado com `eventId: "evt_123"`
- **QUANDO** sistema tenta reenviar (retry)
- **ENTÃO** cliente deve:
  - Usar `eventId` como chave de idempotência
  - Ignorar eventos duplicados
  - Retornar **200 OK** mesmo se duplicado

**AC-022: Validação de assinatura**

- **QUANDO** cliente recebe webhook
- **ENTÃO** cliente deve:
  - Validar `X-Signature` header
  - Calcular HMAC-SHA256 do body com secret compartilhado
  - Rejeitar se assinatura inválida

**AC-023: Timeout de webhook**

- **QUANDO** cliente demora **> 5 segundos** para responder
- **ENTÃO** o sistema deve:
  - Considerar timeout
  - Agendar retry automático
  - Logar falha de webhook

**AC-024: Ordering de eventos**

- **DADO** que múltiplos eventos ocorrem para mesmo email
- **QUANDO** webhooks são enviados
- **ENTÃO** o sistema deve:
  - Enviar eventos em ordem (melhor-esforço)
  - Incluir `sequenceNumber` no payload
  - Cliente deve usar `timestamp` e `sequenceNumber` para ordenar

**Validação Técnica:**

```typescript
// Test case
describe('Webhooks (when enabled)', () => {
  it('should send webhook on email sent', async () => {
    // Configure webhook URL
    await configureWebhook('https://client.com/webhook');

    // Send email
    await sendEmail({ externalId: 'BOL-WEBHOOK-001', ... });

    // Wait for async webhook delivery
    await waitForWebhook();

    // Verify webhook was called
    expect(webhookMock).toHaveBeenCalledWith({
      eventType: 'email.sent',
      eventId: expect.stringMatching(/^evt_/),
      data: expect.objectContaining({
        externalId: 'BOL-WEBHOOK-001',
        status: 'SENT',
      }),
    });
  });

  it('should include HMAC signature', async () => {
    await sendEmail({ ... });
    await waitForWebhook();

    const call = webhookMock.mock.calls[0];
    const signature = call.headers['X-Signature'];
    const expectedSignature = calculateHMAC(call.body, webhookSecret);

    expect(signature).toBe(expectedSignature);
  });
});
```

---

## Critérios Não-Funcionais

### Performance

**AC-025: Latência de ingestão**

- **QUANDO** faço requisição `POST /v1/email/send`
- **ENTÃO** o sistema deve:
  - Responder em **< 250ms** (P95)
  - Persistir em outbox + enfileirar job

**AC-026: Throughput**

- **QUANDO** envio pico de **2.000 emails/hora**
- **ENTÃO** o sistema deve:
  - Processar sem degradação
  - Manter latência < 250ms (P95)

**AC-027: Tempo fila → envio**

- **QUANDO** email é enfileirado
- **ENTÃO** o sistema deve:
  - Processar em **< 60s** (P95) com fila nominal

### Confiabilidade

**AC-028: Zero perda**

- **DADO** que email foi persistido em `email_outbox`
- **QUANDO** ocorre falha (Redis down, worker crash)
- **ENTÃO** o sistema deve:
  - **NÃO perder** email
  - Reprocessar após recovery

**AC-029: Disponibilidade**

- **QUANDO** medir disponibilidade em horário comercial (8h-18h)
- **ENTÃO** o sistema deve:
  - Atingir **≥ 99,5%** de uptime

### Segurança

**AC-030: PII mascarado em logs**

- **QUANDO** sistema loga eventos
- **ENTÃO** deve:
  - **NUNCA** logar email completo (apenas mascarado: `u***@e***.com`)
  - **NUNCA** logar CPF/CNPJ completo (apenas hash ou mascarado)
  - **NUNCA** logar HTML content

**AC-031: Criptografia em trânsito**

- **QUANDO** cliente faz requisição
- **ENTÃO** deve:
  - Usar **TLS 1.2+**
  - Rejeitar conexões não-criptografadas

---

## Cenários de Teste

### Cenário 1: Envio completo end-to-end

```gherkin
Feature: Envio de email end-to-end

Scenario: Envio bem-sucedido de boleto
  Given que tenho API Key válida "sk_live_abc123"
  And tenho payload válido com externalId "BOL-E2E-001"
  When envio POST /v1/email/send
  Then recebo resposta 201 Created
  And resposta contém outboxId
  And resposta contém requestId
  And email é persistido em email_outbox
  And job é enfileirado no Redis com jobId = outboxId
  And worker processa job em < 60s
  And email é enviado via SES
  And status muda para SENT
  And messageId é armazenado
  And evento email.sent é criado
```

### Cenário 2: Idempotência em retry

```gherkin
Scenario: Cliente reenvia após timeout
  Given que enviei email com externalId "BOL-RETRY-001"
  And não recebi resposta (timeout)
  When envio novamente com mesmo externalId
  Then recebo resposta 200 OK (não 201)
  And outboxId é o mesmo da primeira requisição
  And status retornado é o atual (ex: SENT)
  And apenas 1 registro existe em email_outbox
```

### Cenário 3: Validação de erro

```gherkin
Scenario: Payload inválido é rejeitado
  Given que tenho payload sem campo recipient
  When envio POST /v1/email/send
  Then recebo resposta 400 Bad Request
  And erro contém code "VALIDATION_ERROR"
  And erro contém field "recipient"
  And nada é persistido no banco
  And nenhum job é enfileirado
```

### Cenário 4: Consulta com filtros

```gherkin
Scenario: Busca por externalId
  Given que existem 3 emails com externalId "BOL-FILTER-001"
  When consulto GET /v1/emails?externalId=BOL-FILTER-001
  Then recebo resposta 200 OK
  And response.data contém 3 registros
  And todos registros têm externalId "BOL-FILTER-001"
  And emails estão mascarados
  And CPF/CNPJ estão mascarados
```

---

## Checklist de Aceitação

Use este checklist para validar o MVP antes do go-live:

### Funcionalidades Core

- [ ] **AC-001 a AC-003:** Idempotência funcionando
- [ ] **AC-004 a AC-010:** Validações negativas implementadas
- [ ] **AC-011 a AC-018:** Consultas por filtros operacionais
- [ ] **AC-019 a AC-024:** Webhooks (se habilitados) funcionais

### Performance

- [ ] **AC-025:** Latência de ingestão < 250ms (P95)
- [ ] **AC-026:** Throughput ≥ 2.000 emails/hora
- [ ] **AC-027:** Tempo fila → envio < 60s (P95)

### Confiabilidade

- [ ] **AC-028:** Zero perda validado em testes de caos
- [ ] **AC-029:** Disponibilidade ≥ 99,5% medida

### Segurança

- [ ] **AC-030:** PII mascarado em todos os logs
- [ ] **AC-031:** TLS 1.2+ obrigatório

### Testes Executados

- [ ] Testes unitários: cobertura ≥ 70%
- [ ] Testes de integração: todos passando
- [ ] Testes end-to-end: cenários principais validados
- [ ] Testes de carga: pico de 2.000 emails/hora
- [ ] Testes de caos: Redis down, SES 429, disco cheio

### Documentação

- [ ] API documentada (OpenAPI/Swagger)
- [ ] Runbooks de operação criados
- [ ] Guias de troubleshooting disponíveis

---

## Referências

- [System Design Overview](../architecture/01-visao-geral-sistema.md)
- [Email Send Contract](../api/03-email-send-contract.md)
- [Email Get Contract](../api/04-email-get-contract.md)
- [Testing Standards](./TESTING-STANDARDS.md)
- [ADR-20250116-escolha-redis-queue](../adrs/ADR-20250116-escolha-redis-queue.md)
- [ADR-20250120-auth-model-mvp](../adrs/ADR-20250120-auth-model-mvp.md)

---

**Template version:** 1.0
**Last updated:** 2025-01-23
