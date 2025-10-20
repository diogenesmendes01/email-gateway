# 01-endpoints-api

> **Tipo:** API
> **Status:** Em Desenvolvimento
> **Última atualização:** 2025-10-19
> **Responsável:** Equipe de Desenvolvimento

## Visão Geral

Documentação dos endpoints da API REST para envio de e-mails (boletos) do MVP. A API segue os princípios RESTful e opera de forma **assíncrona**, enfileirando jobs para processamento em background.

## Índice

- [Autenticação](#autenticação)
- [Versionamento](#versionamento)
- [Rate Limiting](#rate-limiting)
- [Endpoints](#endpoints)
  - [POST /v1/email/send](#post-v1emailsend)
  - [GET /v1/emails/{id}](#get-v1emailsid)
  - [GET /v1/emails](#get-v1emails)
- [Códigos de Status](#códigos-de-status)
- [Formato de Erros](#formato-de-erros)
- [Referências](#referências)

## Autenticação

Todos os endpoints requerem autenticação via **API Key** no header:

```http
X-API-Key: sk_live_abc123xyz
```

### Regras de Autenticação

1. **API Key por Empresa**: Cada empresa parceira recebe uma chave única
2. **IP Allowlist**: Opcionalmente, IPs podem ser restritos por empresa
3. **Rotação**: API Keys devem ser rotacionadas periodicamente
4. **Segurança**: Todas requisições devem ser via **HTTPS/TLS**

**Erro:** `401 Unauthorized` se chave inválida ou ausente
**Erro:** `403 Forbidden` se IP não autorizado

Veja detalhes em: [02-auth-security.md](./02-auth-security.md)

## Versionamento

A API usa versionamento via path: `/v1/*`

- **Versão atual**: `v1`
- **Compatibilidade**: Breaking changes resultam em nova versão (`/v2/*`)
- **Deprecação**: Versões antigas terão suporte por mínimo 6 meses

## Rate Limiting

Limites aplicados **por empresa** (`company_id`):

| Janela | Limite | Descrição |
|--------|--------|-----------|
| 1 minuto | 100 requisições | Burst curto |
| 1 hora | 2.000 requisições | Operação normal |
| 1 dia | 10.000 requisições | Limite diário |

**Headers de Resposta:**

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1634567890
```

**Erro:** `429 Too Many Requests` se limite excedido
**Header adicional:** `Retry-After: 60` (segundos)

Veja detalhes em: [06-rate-limits.md](./06-rate-limits.md)

## Endpoints

### POST /v1/email/send

Cria uma requisição de envio de e-mail (boleto). Operação **assíncrona**: valida, persiste no outbox, enfileira job e retorna `202 Accepted` imediatamente.

**Documentação completa:** [03-email-send-contract.md](./03-email-send-contract.md)

#### Headers

```http
POST /v1/email/send HTTP/1.1
Host: api.emailgateway.com
Content-Type: application/json
X-API-Key: sk_live_abc123xyz
Idempotency-Key: idp_unique_123 (recomendado)
X-Request-Id: req_custom_12345 (opcional)
```

#### Request Body (Mínimo)

```json
{
  "to": "cliente@exemplo.com",
  "subject": "Boleto Vencimento 15/02/2025",
  "html": "<html><body><h1>Boleto</h1>...</body></html>"
}
```

#### Request Body (Completo)

```json
{
  "to": "cliente@exemplo.com",
  "cc": ["gerente@exemplo.com"],
  "bcc": ["auditoria@empresa.com"],
  "subject": "Boleto Mensal - Janeiro 2025",
  "html": "<html><body><h1>Boleto</h1>...</body></html>",
  "replyTo": "financeiro@empresa.com",
  "headers": {
    "X-Custom-Invoice": "INV-2025-001"
  },
  "tags": ["boleto", "mensal"],
  "recipient": {
    "externalId": "CUST-98765",
    "cpfCnpj": "12345678901",
    "nome": "João da Silva",
    "email": "cliente@exemplo.com"
  },
  "externalId": "SEND-2025-001"
}
```

#### Response 202 Accepted

```json
{
  "outboxId": "550e8400-e29b-41d4-a716-446655440000",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "requestId": "req_abc123xyz",
  "status": "ENQUEUED",
  "receivedAt": "2025-10-19T14:30:00.000Z",
  "recipient": {
    "externalId": "CUST-98765"
  }
}
```

#### Validações Principais

- `to`, `subject`, `html`: obrigatórios
- Payload total: <= 1MB
- HTML: <= 1MB
- Subject: 1-150 chars, sem quebras de linha
- `cc`/`bcc`: max 5 endereços cada
- `recipient.cpfCnpj`: validação de dígitos verificadores
- `recipient.email` (se fornecido): deve coincidir com `to`

#### Idempotência

Use `Idempotency-Key` ou `externalId` para evitar duplicações:

- **Mesma chave + mesmo payload**: retorna mesmos `outboxId`/`jobId` (202)
- **Mesma chave + payload diferente**: retorna `409 Conflict`

---

### GET /v1/emails/{id}

Consulta detalhes de um envio específico.

#### Request

```http
GET /v1/emails/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
Host: api.emailgateway.com
X-API-Key: sk_live_abc123xyz
```

#### Response 200 OK

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "companyId": "440e7300-d18a-31c3-9605-335544330000",
  "status": "SENT",
  "to": "cliente@exemplo.com",
  "subject": "Boleto Vencimento 15/02/2025",
  "recipient": {
    "externalId": "CUST-12345",
    "nome": "João da Silva",
    "email": "cliente@exemplo.com",
    "cpfCnpj": "***.456.789-**"
  },
  "externalId": "SEND-2025-001",
  "sesMessageId": "0100018c5f1e2a3b-abc12345-000000",
  "attempts": 1,
  "requestId": "req_abc123xyz",
  "createdAt": "2025-10-19T14:30:00.000Z",
  "sentAt": "2025-10-19T14:30:15.000Z",
  "events": [
    {
      "type": "CREATED",
      "timestamp": "2025-10-19T14:30:00.000Z"
    },
    {
      "type": "ENQUEUED",
      "timestamp": "2025-10-19T14:30:01.000Z"
    },
    {
      "type": "SENT",
      "timestamp": "2025-10-19T14:30:15.000Z",
      "metadata": {
        "sesMessageId": "0100018c5f1e2a3b-abc12345-000000"
      }
    }
  ]
}
```

#### Erros

- `401 Unauthorized`: API Key inválida
- `403 Forbidden`: Tentando acessar e-mail de outra empresa
- `404 Not Found`: E-mail não encontrado

---

### GET /v1/emails

Lista e filtra envios de e-mail com paginação.

#### Request

```http
GET /v1/emails?status=SENT&dateFrom=2025-10-01&dateTo=2025-10-31&page=1&pageSize=20 HTTP/1.1
Host: api.emailgateway.com
X-API-Key: sk_live_abc123xyz
```

#### Query Parameters

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `status` | string | Filtrar por status (`SENT`, `FAILED`, etc.) |
| `dateFrom` | ISO 8601 | Data inicial (inclusive) |
| `dateTo` | ISO 8601 | Data final (inclusive) |
| `to` | string | Filtrar por e-mail destinatário |
| `recipientExternalId` | string | Filtrar por ID externo do recipient |
| `cpfCnpj` | string | Filtrar por CPF/CNPJ (será hasheado) |
| `razaoSocial` | string | Filtrar por razão social |
| `nome` | string | Filtrar por nome |
| `externalId` | string | Filtrar por ID externo do envio |
| `page` | number | Página (default: 1) |
| `pageSize` | number | Itens por página (default: 20, max: 100) |
| `sort` | string | Ordenação (default: `createdAt:desc`) |

#### Response 200 OK

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "SENT",
      "to": "cliente@exemplo.com",
      "subject": "Boleto Vencimento 15/02/2025",
      "recipientName": "João da Silva",
      "externalId": "SEND-2025-001",
      "attempts": 1,
      "createdAt": "2025-10-19T14:30:00.000Z",
      "sentAt": "2025-10-19T14:30:15.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

## Códigos de Status

### Status de Envio

| Status | Descrição | Terminal? |
|--------|-----------|-----------|
| `PENDING` | Criado, aguardando enfileiramento | Não |
| `ENQUEUED` | Na fila aguardando worker | Não |
| `PROCESSING` | Sendo processado pelo worker | Não |
| `SENT` | Enviado com sucesso via SES | Sim |
| `FAILED` | Falha permanente | Sim |
| `RETRYING` | Em retry após falha temporária | Não |

### Códigos HTTP

| Código | Descrição | Quando Usar |
|--------|-----------|-------------|
| 200 OK | Sucesso (GET) | Consultas bem-sucedidas |
| 202 Accepted | Aceito (POST) | Job enfileirado com sucesso |
| 400 Bad Request | Requisição malformada | JSON inválido, campos faltando |
| 401 Unauthorized | Não autenticado | API Key inválida/ausente |
| 403 Forbidden | Não autorizado | IP bloqueado, acesso negado |
| 404 Not Found | Não encontrado | Recurso não existe |
| 409 Conflict | Conflito | Idempotency-Key duplicada |
| 413 Payload Too Large | Payload > 1MB | Body muito grande |
| 422 Unprocessable Entity | Validação falhou | Email inválido, CPF inválido |
| 429 Too Many Requests | Rate limit excedido | Muitas requisições |
| 500 Internal Server Error | Erro interno | Erro inesperado |
| 503 Service Unavailable | Serviço indisponível | Redis/Postgres down |

## Formato de Erros

Todos os erros seguem o formato padrão:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed for one or more fields",
    "requestId": "req_abc123xyz",
    "timestamp": "2025-10-19T14:30:00.000Z",
    "details": [
      {
        "field": "to",
        "message": "Invalid email format",
        "value": "invalid-email"
      }
    ]
  }
}
```

### Códigos de Erro Internos

| Código | HTTP | Descrição |
|--------|------|-----------|
| `BAD_REQUEST` | 400 | Requisição malformada |
| `UNAUTHORIZED` | 401 | Autenticação falhou |
| `FORBIDDEN` | 403 | Acesso negado |
| `CONFLICT` | 409 | Conflito de idempotência |
| `PAYLOAD_TOO_LARGE` | 413 | Payload muito grande |
| `VALIDATION_ERROR` | 422 | Validação falhou |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit excedido |
| `INTERNAL_ERROR` | 500 | Erro interno |
| `SERVICE_UNAVAILABLE` | 503 | Serviço indisponível |

Veja detalhes em: [05-error-models-retries.md](./05-error-models-retries.md)

## Validação

Todos os inputs são validados usando **Zod schemas** antes do processamento:

- Schemas disponíveis em: [schemas/email-send.schema.ts](./schemas/email-send.schema.ts)
- Tipos TypeScript em: [schemas/email-send.types.ts](./schemas/email-send.types.ts)
- Documentação de uso em: [schemas/README.md](./schemas/README.md)

## Referências

### Documentação Detalhada

- [03-email-send-contract.md](./03-email-send-contract.md) - Contrato completo do endpoint POST /v1/email/send
- [02-auth-security.md](./02-auth-security.md) - Autenticação e segurança
- [05-error-models-retries.md](./05-error-models-retries.md) - Modelos de erro e retries
- [06-rate-limits.md](./06-rate-limits.md) - Estratégia de rate limiting

### Schemas e Tipos

- [schemas/email-send.schema.ts](./schemas/email-send.schema.ts) - Schemas Zod
- [schemas/email-send.types.ts](./schemas/email-send.types.ts) - Tipos TypeScript
- [schemas/README.md](./schemas/README.md) - Como usar os schemas

### Arquitetura

- [../architecture/01-visao-geral-sistema.md](../architecture/01-visao-geral-sistema.md) - Visão geral
- [../data/01-domain-data-model.md](../data/01-domain-data-model.md) - Modelo de dados
- [../worker/02-retry-strategy.md](../worker/02-retry-strategy.md) - Estratégia de retry

---

**Template version:** 1.0
**Last updated:** 2025-10-19
