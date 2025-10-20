# 04 — Contrato GET /v1/emails

> **Tipo:** API
> **Status:** Em Desenvolvimento
> **Última atualização:** 2025-10-19
> **Responsável:** Equipe de Desenvolvimento

## Visão Geral

Documentação completa dos endpoints de consulta de e-mails do MVP. Estes endpoints permitem listar e consultar detalhes de envios de e-mails (boletos) com filtros avançados, paginação e masking de dados sensíveis.

## Índice

- [GET /v1/emails/:id](#get-v1emailsid)
- [GET /v1/emails](#get-v1emails)
- [Filtros Disponíveis](#filtros-disponíveis)
- [Paginação](#paginação)
- [Ordenação](#ordenação)
- [Masking de Dados Sensíveis](#masking-de-dados-sensíveis)
- [Códigos de Status](#códigos-de-status)
- [Exemplos](#exemplos)

---

## GET /v1/emails/:id

Consulta detalhes completos de um envio de e-mail específico por ID.

### Endpoint

```
GET /v1/emails/{id}
```

### Headers

```http
X-API-Key: sk_live_abc123xyz
```

### Path Parameters

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `id` | string (uuid) | ID do envio (outboxId) |

### Response 200 OK

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "companyId": "440e7300-d18a-31c3-9605-335544330000",
  "status": "SENT",
  "to": "cliente@exemplo.com",
  "cc": ["gerente@exemplo.com"],
  "bcc": [],
  "subject": "Boleto Vencimento 15/02/2025",
  "recipient": {
    "id": "rec_abc123",
    "externalId": "CUST-12345",
    "nome": "João da Silva",
    "razaoSocial": null,
    "email": "cliente@exemplo.com",
    "cpfCnpj": "***.456.789-**"
  },
  "externalId": "SEND-2025-001",
  "sesMessageId": "0100018c5f1e2a3b-abc12345-000000",
  "attempts": 1,
  "requestId": "req_abc123xyz",
  "tags": ["boleto", "mensal"],
  "errorCode": null,
  "errorReason": null,
  "durationMs": 245,
  "createdAt": "2025-10-19T14:30:00.000Z",
  "enqueuedAt": "2025-10-19T14:30:01.000Z",
  "sentAt": "2025-10-19T14:30:15.000Z",
  "failedAt": null,
  "events": [
    {
      "id": "evt_001",
      "type": "CREATED",
      "timestamp": "2025-10-19T14:30:00.000Z",
      "metadata": null
    },
    {
      "id": "evt_002",
      "type": "ENQUEUED",
      "timestamp": "2025-10-19T14:30:01.000Z",
      "metadata": {
        "jobId": "550e8400-e29b-41d4-a716-446655440000"
      }
    },
    {
      "id": "evt_003",
      "type": "PROCESSING",
      "timestamp": "2025-10-19T14:30:10.000Z",
      "metadata": null
    },
    {
      "id": "evt_004",
      "type": "SENT",
      "timestamp": "2025-10-19T14:30:15.000Z",
      "metadata": {
        "sesMessageId": "0100018c5f1e2a3b-abc12345-000000"
      }
    }
  ]
}
```

### Response 404 Not Found

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Email not found",
    "requestId": "req_xyz789",
    "timestamp": "2025-10-19T14:35:00.000Z"
  }
}
```

### Response 403 Forbidden

Retornado quando a API Key tenta acessar um e-mail de outra empresa:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this resource",
    "requestId": "req_xyz789",
    "timestamp": "2025-10-19T14:35:00.000Z"
  }
}
```

### Regras de Negócio

1. **Isolamento por Empresa**: Cada empresa só pode consultar seus próprios e-mails
2. **Masking Automático**: CPF/CNPJ sempre retorna mascarado (`***.456.789-**`)
3. **Eventos Ordenados**: Array `events` sempre ordenado por `timestamp` (ascendente)
4. **Campos Opcionais**: `recipient`, `externalId`, `tags`, etc. podem ser `null` se não fornecidos

---

## GET /v1/emails

Lista e filtra envios de e-mail com paginação.

### Endpoint

```
GET /v1/emails
```

### Headers

```http
X-API-Key: sk_live_abc123xyz
```

### Query Parameters

#### Filtros

| Parâmetro | Tipo | Descrição | Exemplo |
|-----------|------|-----------|---------|
| `status` | EmailStatus | Filtrar por status | `SENT`, `FAILED`, `PENDING` |
| `dateFrom` | ISO 8601 | Data inicial (inclusive) | `2025-10-01T00:00:00.000Z` |
| `dateTo` | ISO 8601 | Data final (inclusive) | `2025-10-31T23:59:59.999Z` |
| `to` | string | E-mail do destinatário | `cliente@exemplo.com` |
| `recipientExternalId` | string | ID externo do destinatário | `CUST-12345` |
| `cpfCnpj` | string | CPF/CNPJ (será hasheado) | `12345678901` |
| `razaoSocial` | string | Razão social (partial match) | `Silva Ltda` |
| `nome` | string | Nome (partial match) | `João` |
| `externalId` | string | ID externo do envio | `SEND-2025-001` |
| `tags` | string | Tag (multi-value com `,`) | `boleto,mensal` |

#### Paginação

| Parâmetro | Tipo | Default | Max | Descrição |
|-----------|------|---------|-----|-----------|
| `page` | number | `1` | - | Número da página |
| `pageSize` | number | `20` | `100` | Itens por página |
| `cursor` | string | - | - | Cursor para paginação (alternativo a `page`) |

#### Ordenação

| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `sort` | string | `createdAt:desc` | Campo:direção (`asc`/`desc`) |

**Campos Ordenáveis:**

- `createdAt`
- `sentAt`
- `status`
- `to`

### Response 200 OK

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "SENT",
      "to": "cliente@exemplo.com",
      "subject": "Boleto Vencimento 15/02/2025",
      "recipientName": "João da Silva",
      "recipientExternalId": "CUST-12345",
      "externalId": "SEND-2025-001",
      "attempts": 1,
      "tags": ["boleto", "mensal"],
      "createdAt": "2025-10-19T14:30:00.000Z",
      "sentAt": "2025-10-19T14:30:15.000Z"
    },
    {
      "id": "660e9500-f39c-52e5-b827-557766551111",
      "status": "FAILED",
      "to": "invalido@example.com",
      "subject": "Boleto Vencimento 20/02/2025",
      "recipientName": "Maria Oliveira",
      "recipientExternalId": "CUST-67890",
      "externalId": null,
      "attempts": 3,
      "tags": [],
      "createdAt": "2025-10-19T13:00:00.000Z",
      "sentAt": null
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false,
    "cursor": {
      "next": "eyJpZCI6IjY2MGU5NTAwLWYzOWMtNTJlNS1iODI3LTU1Nzc2NjU1MTExMSIsImNyZWF0ZWRBdCI6IjIwMjUtMTAtMTlUMTM6MDA6MDAuMDAwWiJ9",
      "prev": null
    }
  }
}
```

### Response 200 OK (Empty)

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 0,
    "hasNext": false,
    "hasPrev": false,
    "cursor": {
      "next": null,
      "prev": null
    }
  }
}
```

### Response 400 Bad Request (Validação)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid query parameters",
    "requestId": "req_xyz789",
    "timestamp": "2025-10-19T14:35:00.000Z",
    "details": [
      {
        "field": "pageSize",
        "message": "pageSize must not exceed 100",
        "value": 200
      }
    ]
  }
}
```

---

## Filtros Disponíveis

### Por Status

```http
GET /v1/emails?status=SENT
GET /v1/emails?status=FAILED
GET /v1/emails?status=PENDING,ENQUEUED,PROCESSING
```

**Valores aceitos:**

- `PENDING` - Criado, aguardando enfileiramento
- `ENQUEUED` - Na fila aguardando worker
- `PROCESSING` - Sendo processado pelo worker
- `SENT` - Enviado com sucesso
- `FAILED` - Falha permanente
- `RETRYING` - Em retry após falha temporária

### Por Data

```http
# Últimos 7 dias
GET /v1/emails?dateFrom=2025-10-12T00:00:00.000Z&dateTo=2025-10-19T23:59:59.999Z

# Hoje
GET /v1/emails?dateFrom=2025-10-19T00:00:00.000Z

# Até ontem
GET /v1/emails?dateTo=2025-10-18T23:59:59.999Z
```

**Regras:**

- Sempre usar ISO 8601 com timezone (UTC recomendado)
- `dateFrom` é inclusive
- `dateTo` é inclusive
- Se apenas `dateFrom`: busca a partir da data
- Se apenas `dateTo`: busca até a data

### Por Destinatário

```http
# Por e-mail
GET /v1/emails?to=cliente@exemplo.com

# Por ID externo
GET /v1/emails?recipientExternalId=CUST-12345

# Por CPF/CNPJ (será automaticamente hasheado)
GET /v1/emails?cpfCnpj=12345678901

# Por nome (partial match, case-insensitive)
GET /v1/emails?nome=João

# Por razão social (partial match, case-insensitive)
GET /v1/emails?razaoSocial=Silva
```

**Regras:**

- `cpfCnpj`: aceita apenas dígitos, será hasheado antes da busca
- `nome` e `razaoSocial`: busca parcial (LIKE/ILIKE)
- Busca case-insensitive

### Por ID Externo do Envio

```http
GET /v1/emails?externalId=SEND-2025-001
```

**Regras:**

- Exato match
- Diferente de `recipientExternalId`

### Por Tags

```http
# Uma tag
GET /v1/emails?tags=boleto

# Múltiplas tags (AND)
GET /v1/emails?tags=boleto,mensal

# Múltiplas tags (OR) - usar múltiplos parâmetros
GET /v1/emails?tags=boleto&tags=trimestral
```

**Regras:**

- Vírgula (`,`): operador AND (possui todas as tags)
- Múltiplos parâmetros: operador OR (possui qualquer tag)

### Combinação de Filtros

Todos os filtros podem ser combinados:

```http
GET /v1/emails?status=SENT&dateFrom=2025-10-01&recipientExternalId=CUST-12345&tags=boleto
```

---

## Paginação

### Offset Pagination (Padrão)

```http
GET /v1/emails?page=1&pageSize=20
GET /v1/emails?page=2&pageSize=50
```

**Limitações:**

- `pageSize` máximo: 100
- `pageSize` mínimo: 1
- `page` mínimo: 1

**Metadata retornado:**

```json
{
  "pagination": {
    "page": 2,
    "pageSize": 20,
    "totalItems": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": true
  }
}
```

### Cursor Pagination (Recomendado para grandes volumes)

```http
# Primeira página
GET /v1/emails?pageSize=20

# Próxima página
GET /v1/emails?cursor=eyJpZCI6IjY2MGU5NTAwLi4uIn0&pageSize=20
```

**Vantagens:**

- Mais eficiente para grandes datasets
- Evita problemas de paginação instável (novos items inseridos)

**Metadata retornado:**

```json
{
  "pagination": {
    "cursor": {
      "next": "eyJpZCI6IjY2MGU5NTAwLWYzOWMtNTJlNS1iODI3LTU1Nzc2NjU1MTExMSJ9",
      "prev": "eyJpZCI6IjU1MGU4NDAwLWUyOWItNDFkNC1hNzE2LTQ0NjY1NTQ0MDAwMCJ9"
    }
  }
}
```

**Regras:**

- Cursor é opaco (base64)
- Não combinar `cursor` com `page`
- Cursor expira em 24 horas

---

## Ordenação

### Sintaxe

```
sort={campo}:{direção}
```

**Direções:**

- `asc` - Ascendente (A-Z, 0-9, antigo→recente)
- `desc` - Descendente (Z-A, 9-0, recente→antigo)

### Exemplos

```http
# Mais recentes primeiro (padrão)
GET /v1/emails?sort=createdAt:desc

# Mais antigos primeiro
GET /v1/emails?sort=createdAt:asc

# Por status (alfabético)
GET /v1/emails?sort=status:asc

# Por data de envio (mais recentes enviados primeiro)
GET /v1/emails?sort=sentAt:desc
```

### Campos Ordenáveis

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `createdAt` | DateTime | Data de criação (default: desc) |
| `sentAt` | DateTime | Data de envio |
| `status` | String | Status (alfabético) |
| `to` | String | E-mail do destinatário (alfabético) |

**Regras:**

- Apenas um campo por vez
- Default: `createdAt:desc`
- Valores `null` aparecem no final

---

## Masking de Dados Sensíveis

### CPF/CNPJ

Sempre mascarado nas respostas:

```json
{
  "recipient": {
    "cpfCnpj": "***.456.789-**"
  }
}
```

**Padrão de Masking:**

- **CPF** (11 dígitos): `***.456.789-**` (mostra apenas 6 dígitos centrais)
- **CNPJ** (14 dígitos): `**.345.678/****-**` (mostra apenas 6 dígitos centrais)

**Regras:**

- Masking aplicado em **todas as respostas** (list e detail)
- Campo `cpfCnpjHash` **nunca** retornado
- Campo `cpfCnpjEnc` **nunca** retornado

### Outros Campos Sensíveis

Por segurança, os seguintes campos **não são retornados** nas respostas:

- `cpfCnpjHash` (usado internamente para busca)
- `cpfCnpjEnc` (valor criptografado)
- `html` (apenas via endpoint específico `/v1/emails/:id/html` - fora do escopo MVP)

---

## Códigos de Status

### Success

| Código | Descrição |
|--------|-----------|
| 200 OK | Consulta bem-sucedida |

### Client Errors

| Código | Descrição |
|--------|-----------|
| 400 Bad Request | Query parameters inválidos |
| 401 Unauthorized | API Key ausente ou inválida |
| 403 Forbidden | Tentativa de acessar recurso de outra empresa |
| 404 Not Found | Recurso não encontrado |
| 422 Unprocessable Entity | Validação falhou (ex: CPF inválido) |

### Server Errors

| Código | Descrição |
|--------|-----------|
| 500 Internal Server Error | Erro interno inesperado |
| 503 Service Unavailable | Banco de dados indisponível |

---

## Exemplos

### Exemplo 1: Buscar e-mails enviados hoje

```http
GET /v1/emails?status=SENT&dateFrom=2025-10-19T00:00:00.000Z&sort=sentAt:desc
X-API-Key: sk_live_abc123xyz
```

**Response:**

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
    "totalItems": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

### Exemplo 2: Buscar e-mails de um destinatário específico

```http
GET /v1/emails?recipientExternalId=CUST-12345
X-API-Key: sk_live_abc123xyz
```

**Response:**

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "SENT",
      "to": "cliente@exemplo.com",
      "subject": "Boleto Vencimento 15/02/2025",
      "recipientName": "João da Silva",
      "recipientExternalId": "CUST-12345",
      "externalId": "SEND-2025-001",
      "attempts": 1,
      "createdAt": "2025-10-19T14:30:00.000Z",
      "sentAt": "2025-10-19T14:30:15.000Z"
    },
    {
      "id": "660e9500-f39c-52e5-b827-557766551111",
      "status": "SENT",
      "to": "cliente@exemplo.com",
      "subject": "Boleto Vencimento 20/02/2025",
      "recipientName": "João da Silva",
      "recipientExternalId": "CUST-12345",
      "externalId": "SEND-2025-002",
      "attempts": 1,
      "createdAt": "2025-10-19T15:00:00.000Z",
      "sentAt": "2025-10-19T15:00:12.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 2,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

### Exemplo 3: Buscar e-mails falhados no último mês

```http
GET /v1/emails?status=FAILED&dateFrom=2025-09-19T00:00:00.000Z&dateTo=2025-10-19T23:59:59.999Z&sort=createdAt:desc
X-API-Key: sk_live_abc123xyz
```

**Response:**

```json
{
  "data": [
    {
      "id": "770f0600-g40d-63f6-c938-668877662222",
      "status": "FAILED",
      "to": "invalido@dominio-inexistente.com",
      "subject": "Boleto Vencimento 10/02/2025",
      "recipientName": "Pedro Costa",
      "recipientExternalId": "CUST-99999",
      "externalId": null,
      "attempts": 3,
      "createdAt": "2025-10-15T10:00:00.000Z",
      "sentAt": null
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

### Exemplo 4: Buscar detalhes de um e-mail específico

```http
GET /v1/emails/550e8400-e29b-41d4-a716-446655440000
X-API-Key: sk_live_abc123xyz
```

**Response:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "companyId": "440e7300-d18a-31c3-9605-335544330000",
  "status": "SENT",
  "to": "cliente@exemplo.com",
  "cc": [],
  "bcc": [],
  "subject": "Boleto Vencimento 15/02/2025",
  "recipient": {
    "id": "rec_abc123",
    "externalId": "CUST-12345",
    "nome": "João da Silva",
    "razaoSocial": null,
    "email": "cliente@exemplo.com",
    "cpfCnpj": "***.456.789-**"
  },
  "externalId": "SEND-2025-001",
  "sesMessageId": "0100018c5f1e2a3b-abc12345-000000",
  "attempts": 1,
  "requestId": "req_abc123xyz",
  "tags": ["boleto"],
  "errorCode": null,
  "errorReason": null,
  "durationMs": 245,
  "createdAt": "2025-10-19T14:30:00.000Z",
  "enqueuedAt": "2025-10-19T14:30:01.000Z",
  "sentAt": "2025-10-19T14:30:15.000Z",
  "failedAt": null,
  "events": [
    {
      "id": "evt_001",
      "type": "CREATED",
      "timestamp": "2025-10-19T14:30:00.000Z",
      "metadata": null
    },
    {
      "id": "evt_002",
      "type": "ENQUEUED",
      "timestamp": "2025-10-19T14:30:01.000Z",
      "metadata": {
        "jobId": "550e8400-e29b-41d4-a716-446655440000"
      }
    },
    {
      "id": "evt_003",
      "type": "PROCESSING",
      "timestamp": "2025-10-19T14:30:10.000Z",
      "metadata": null
    },
    {
      "id": "evt_004",
      "type": "SENT",
      "timestamp": "2025-10-19T14:30:15.000Z",
      "metadata": {
        "sesMessageId": "0100018c5f1e2a3b-abc12345-000000"
      }
    }
  ]
}
```

### Exemplo 5: Buscar por CPF

```http
GET /v1/emails?cpfCnpj=12345678901
X-API-Key: sk_live_abc123xyz
```

**Observação:** O CPF será automaticamente hasheado no backend antes da consulta. A resposta retornará o CPF mascarado.

**Response:**

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "SENT",
      "to": "cliente@exemplo.com",
      "subject": "Boleto Vencimento 15/02/2025",
      "recipientName": "João da Silva",
      "recipientExternalId": "CUST-12345",
      "externalId": "SEND-2025-001",
      "attempts": 1,
      "createdAt": "2025-10-19T14:30:00.000Z",
      "sentAt": "2025-10-19T14:30:15.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

---

## Performance e Limites

### Timeouts

- **GET /v1/emails/:id**: timeout de 5s
- **GET /v1/emails**: timeout de 10s

### Limites

- **pageSize máximo**: 100 itens
- **Cursor expiration**: 24 horas
- **Máximo de filtros simultâneos**: 10

### Cache

- **GET /v1/emails/:id**: cache de 30 segundos (CDN/Redis)
- **GET /v1/emails**: sem cache (dados em tempo real)

### Índices de Performance

Os seguintes índices garantem performance:

```sql
-- Já criados no Prisma schema
CREATE INDEX idx_email_logs_company_status ON email_logs(company_id, status);
CREATE INDEX idx_email_logs_company_created ON email_logs(company_id, created_at);
CREATE INDEX idx_recipient_company_external ON recipients(company_id, external_id);
CREATE INDEX idx_recipient_company_hash ON recipients(company_id, cpf_cnpj_hash);
```

---

## Referências

### Documentação Relacionada

- [01-endpoints.md](./01-endpoints.md) - Visão geral dos endpoints
- [03-email-send-contract.md](./03-email-send-contract.md) - Contrato POST /v1/email/send
- [02-auth-security.md](./02-auth-security.md) - Autenticação e segurança
- [05-error-models-retries.md](./05-error-models-retries.md) - Modelos de erro

### Schemas

- [email-send.types.ts](../../packages/shared/src/schemas/email-send.types.ts) - Tipos TypeScript

---

**Template version:** 1.0
**Last updated:** 2025-10-19
