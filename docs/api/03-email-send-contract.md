# 03-email-send-contract

> **Tipo:** API
> **Status:** Em Desenvolvimento
> **Última atualização:** 2025-10-19
> **Responsável:** Equipe de Desenvolvimento

## Índice

- [Visão Geral](#visão-geral)
- [Endpoint](#endpoint)
- [Autenticação e Headers](#autenticação-e-headers)
- [Request Body](#request-body)
- [Validações](#validações)
- [Respostas](#respostas)
- [Idempotência](#idempotência)
- [Rate Limiting](#rate-limiting)
- [Exemplos](#exemplos)
- [Códigos de Erro](#códigos-de-erro)

## Visão Geral

O endpoint `POST /v1/email/send` é responsável por receber requisições de envio de e-mails (boletos) de forma **assíncrona**. O comportamento do endpoint é:

1. Validar a requisição (autenticação, payload, limites)
2. Persistir no **Outbox** (tabela `email_outbox`)
3. Enfileirar job no **Redis/BullMQ**
4. Retornar **202 Accepted** com identificadores de rastreio

A entrega do e-mail não é imediata. O cliente deve consultar o status posteriormente via `GET /v1/emails/{id}`.

## Endpoint

```text
POST /v1/email/send
```

**Comportamento:** Assíncrono
**Timeout:** Não aplicável (retorna imediatamente após enfileirar)
**Latência esperada (P95):** <= 250ms

## Autenticação e Headers

### Headers Obrigatórios

| Header | Tipo | Descrição | Validação |
|--------|------|-----------|-----------|
| `X-API-Key` | string | Chave de autenticação da empresa | Obrigatório. Validado contra `companies.api_key` |
| `Content-Type` | string | Tipo do conteúdo | Deve ser `application/json` |

### Headers Recomendados

| Header | Tipo | Descrição | Validação |
|--------|------|-----------|-----------|
| `Idempotency-Key` | string | Chave de idempotência | Opcional. Max 128 caracteres. Alfanumérico + `-_` |
| `X-Request-Id` | string | ID de correlação do cliente | Opcional. Max 128 caracteres. Propagado nos logs |

### Autenticação

- **Método:** API Key por empresa
- **Validação:**
  - `X-API-Key` deve existir na tabela `companies`
  - IP do cliente deve estar na allowlist da empresa (se configurada)
- **Erro:** `401 Unauthorized` se chave inválida
- **Erro:** `403 Forbidden` se IP não autorizado

### Segurança

- Todas as requisições devem ser via **HTTPS/TLS**
- API Keys devem ser rotacionadas periodicamente
- Rate limiting aplicado por `company_id`

## Request Body

### Estrutura do Payload

```json
{
  "to": "cliente@exemplo.com",
  "cc": ["opcional@exemplo.com"],
  "bcc": ["oculto@exemplo.com"],
  "subject": "Boleto Vencimento 15/02/2025",
  "html": "<html>...</html>",
  "replyTo": "suporte@empresa.com",
  "headers": {
    "X-Custom-Tag": "boleto-mensal"
  },
  "tags": ["boleto", "urgente"],
  "recipient": {
    "externalId": "CUST-12345",
    "cpfCnpj": "12345678901",
    "razaoSocial": "Empresa Exemplo LTDA",
    "nome": "João da Silva",
    "email": "cliente@exemplo.com"
  },
  "externalId": "INVOICE-9876"
}
```

### Campos do Envelope

#### `to` (obrigatório)

- **Tipo:** `string`
- **Descrição:** Endereço de e-mail do destinatário principal
- **Validação:**
  - Formato RFC 5322 (validação básica)
  - Domínio válido
  - Max 254 caracteres
  - Normalização: lowercase
- **Exemplo:** `"cliente@exemplo.com"`

#### `cc` (opcional)

- **Tipo:** `array<string>`
- **Descrição:** Lista de destinatários em cópia
- **Validação:**
  - Min: 0, Max: 5 endereços
  - Cada endereço segue mesmas regras de `to`
- **Exemplo:** `["gerente@exemplo.com", "financeiro@exemplo.com"]`

#### `bcc` (opcional)

- **Tipo:** `array<string>`
- **Descrição:** Lista de destinatários em cópia oculta
- **Validação:**
  - Min: 0, Max: 5 endereços
  - Cada endereço segue mesmas regras de `to`
- **Exemplo:** `["auditoria@empresa.com"]`

#### `subject` (obrigatório)

- **Tipo:** `string`
- **Descrição:** Assunto do e-mail
- **Validação:**
  - Min: 1, Max: 150 caracteres
  - Sem quebras de linha (`\n`, `\r`)
  - Sanitização básica de caracteres especiais
- **Exemplo:** `"Boleto Vencimento 15/02/2025"`

#### `html` (obrigatório)

- **Tipo:** `string`
- **Descrição:** Conteúdo HTML do e-mail (boleto)
- **Validação:**
  - Tamanho máximo: **1MB** (1.048.576 bytes) após serialização
  - Não aceitar URLs remotas (todo conteúdo inline)
  - Sanitização de scripts maliciosos
  - Encoding: UTF-8
- **Armazenamento:**
  - MVP: armazenado diretamente no campo `html_ref` da tabela `email_outbox`
  - Futuro: mover para storage externo (S3/MinIO)
- **Exemplo:** `"<html><body><h1>Boleto</h1>...</body></html>"`

#### `replyTo` (opcional)

- **Tipo:** `string`
- **Descrição:** Endereço para respostas
- **Validação:** Mesmo formato de `to`
- **Exemplo:** `"suporte@empresa.com"`

#### `headers` (opcional)

- **Tipo:** `object<string, string>`
- **Descrição:** Headers customizados do e-mail
- **Validação:**
  - Apenas headers na safe-list: `X-Custom-*`, `X-Priority`
  - Max: 10 pares
  - Chaves: max 64 chars, valores: max 256 chars
- **Exemplo:**
  ```json
  {
    "X-Custom-Invoice": "INV-123",
    "X-Priority": "1"
  }
  ```

#### `tags` (opcional)

- **Tipo:** `array<string>`
- **Descrição:** Etiquetas para categorização/filtros
- **Validação:**
  - Min: 0, Max: 5 tags
  - Cada tag: 1-32 caracteres, alfanumérico + `-_`
- **Exemplo:** `["boleto", "urgente", "primeira-via"]`

### Campos do Destinatário (`recipient`)

O bloco `recipient` é **opcional, porém recomendado** para rastreabilidade e auditoria.

#### `recipient.externalId` (recomendado)

- **Tipo:** `string`
- **Descrição:** Identificador do destinatário no sistema do parceiro
- **Validação:**
  - Min: 1, Max: 64 caracteres
  - **Unicidade:** Por `company_id` (não pode haver dois recipients com mesmo `externalId` na mesma empresa)
  - Alfanumérico + `-_`
- **Exemplo:** `"CUST-12345"`
- **Uso:** Permite relacionar o destinatário entre envios diferentes

#### `recipient.cpfCnpj` (opcional)

- **Tipo:** `string`
- **Descrição:** CPF (11 dígitos) ou CNPJ (14 dígitos) do destinatário
- **Validação:**
  - Apenas dígitos (remover pontuação antes de enviar)
  - Comprimento: 11 (CPF) ou 14 (CNPJ)
  - Validação de dígitos verificadores
- **Armazenamento:**
  - **Hash** (`cpf_cnpj_hash`): SHA-256 para busca
  - **Cifrado** (`cpf_cnpj_enc`): AES-256-GCM para armazenamento seguro
  - **Exibição:** Sempre mascarado no dashboard (`***.***.***-**` para CPF, `**.***.***/****-**` para CNPJ)
- **Segurança:**
  - **NUNCA** logar em claro
  - **NUNCA** trafegar em claro no payload do job (apenas hash)
- **Exemplo:** `"12345678901"` (CPF) ou `"12345678000195"` (CNPJ)

#### `recipient.razaoSocial` (opcional)

- **Tipo:** `string`
- **Descrição:** Razão social da pessoa jurídica
- **Validação:**
  - Min: 1, Max: 150 caracteres
  - Usado quando destinatário é PJ
- **Exemplo:** `"Empresa Exemplo LTDA"`

#### `recipient.nome` (opcional)

- **Tipo:** `string`
- **Descrição:** Nome da pessoa física
- **Validação:**
  - Min: 1, Max: 120 caracteres
  - Usado quando destinatário é PF
- **Exemplo:** `"João da Silva"`

#### `recipient.email` (opcional)

- **Tipo:** `string`
- **Descrição:** E-mail do destinatário (referência)
- **Validação:**
  - Se fornecido, **DEVE coincidir** com o campo `to` do envelope
  - Caso contrário: retornar `422 Unprocessable Entity`
- **Exemplo:** `"cliente@exemplo.com"`

### Campo de Correlação do Pedido

#### `externalId` (opcional)

- **Tipo:** `string`
- **Descrição:** Identificador do **envio** no sistema do parceiro (diferente de `recipient.externalId`)
- **Validação:**
  - Min: 1, Max: 64 caracteres
  - Alfanumérico + `-_`
- **Uso:** Permite ao parceiro rastrear este envio específico
- **Exemplo:** `"INVOICE-9876"`

### Limitações

- **Tamanho total do payload:** <= 1MB (1.048.576 bytes)
- **Anexos:** **Fora do escopo do MVP**

## Validações

### Validações de Entrada

1. **Tamanho do Payload**
   - JSON total <= 1MB
   - Retornar `413 Payload Too Large` se exceder

2. **Campos Obrigatórios**
   - `to`, `subject`, `html` devem estar presentes
   - Retornar `400 Bad Request` com detalhes dos campos faltantes

3. **Formato de E-mail**
   - `to`, `cc`, `bcc`, `replyTo` devem ter formato válido
   - Normalização: converter para lowercase
   - Retornar `422 Unprocessable Entity` para formatos inválidos

4. **Validação de CPF/CNPJ**
   - Se `recipient.cpfCnpj` fornecido:
     - Validar comprimento (11 ou 14 dígitos)
     - Validar dígitos verificadores
     - Retornar `422 Unprocessable Entity` se inválido

5. **Consistência recipient.email vs to**
   - Se `recipient.email` fornecido, deve ser igual a `to`
   - Retornar `422 Unprocessable Entity` se divergir

6. **Sanitização**
   - `subject`: remover quebras de linha, limitar caracteres especiais
   - `html`: sanitizar scripts, validar UTF-8

7. **Limites de Lista**
   - `cc`: max 5 endereços
   - `bcc`: max 5 endereços
   - `tags`: max 5 tags
   - `headers`: max 10 pares
   - Retornar `422 Unprocessable Entity` se exceder

### Validações de Negócio

1. **Autenticação**
   - `X-API-Key` deve existir e estar ativa
   - Retornar `401 Unauthorized` se inválida

2. **Autorização**
   - IP do cliente na allowlist (se configurada)
   - Retornar `403 Forbidden` se não autorizado

3. **Rate Limiting**
   - Verificar limites por `company_id`
   - Retornar `429 Too Many Requests` se exceder

4. **Idempotência**
   - Verificar `Idempotency-Key` ou `externalId`
   - Retornar `409 Conflict` se mesma chave com corpo diferente
   - Retornar `202 Accepted` com mesmos IDs se requisição equivalente

## Respostas

### 202 Accepted (Sucesso)

Indica que a requisição foi aceita e o job foi enfileirado com sucesso.

**Status Code:** `202 Accepted`

**Headers:**
```text
Content-Type: application/json
X-Request-Id: <requestId gerado ou propagado>
```

**Body:**
```json
{
  "outboxId": "550e8400-e29b-41d4-a716-446655440000",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "requestId": "req_abc123xyz",
  "status": "ENQUEUED",
  "receivedAt": "2025-10-19T14:30:00.000Z",
  "recipient": {
    "externalId": "CUST-12345"
  }
}
```

**Campos:**

- `outboxId` (uuid): ID do registro na tabela `email_outbox`
- `jobId` (uuid): ID do job na fila Redis/BullMQ (igual a `outboxId`)
- `requestId` (string): ID de correlação (gerado ou recebido via header)
- `status` (string): Sempre `"ENQUEUED"` nesta resposta
- `receivedAt` (ISO 8601): Timestamp de recebimento da requisição
- `recipient.externalId` (string, opcional): Ecoa o `recipient.externalId` enviado

### 4xx Erros de Cliente

Todos os erros seguem o mesmo formato:

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

#### 400 Bad Request

**Quando:** Campos obrigatórios faltando ou payload malformado

**Exemplo:**
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Missing required fields: to, subject",
    "requestId": "req_abc123xyz",
    "timestamp": "2025-10-19T14:30:00.000Z",
    "details": [
      {
        "field": "to",
        "message": "Field is required"
      },
      {
        "field": "subject",
        "message": "Field is required"
      }
    ]
  }
}
```

#### 401 Unauthorized

**Quando:** `X-API-Key` ausente ou inválida

**Exemplo:**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing API key",
    "requestId": "req_abc123xyz",
    "timestamp": "2025-10-19T14:30:00.000Z"
  }
}
```

#### 403 Forbidden

**Quando:** IP não autorizado (não está na allowlist)

**Exemplo:**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "IP address not allowed",
    "requestId": "req_abc123xyz",
    "timestamp": "2025-10-19T14:30:00.000Z",
    "details": [
      {
        "field": "clientIp",
        "message": "IP 192.168.1.100 is not in allowlist"
      }
    ]
  }
}
```

#### 409 Conflict

**Quando:** `Idempotency-Key` duplicada com corpo diferente

**Exemplo:**
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Idempotency key already used with different payload",
    "requestId": "req_abc123xyz",
    "timestamp": "2025-10-19T14:30:00.000Z",
    "details": [
      {
        "field": "Idempotency-Key",
        "message": "Key 'idp_123abc' was used with different request body"
      }
    ]
  }
}
```

#### 413 Payload Too Large

**Quando:** Payload excede 1MB

**Exemplo:**
```json
{
  "error": {
    "code": "PAYLOAD_TOO_LARGE",
    "message": "Request payload exceeds maximum size of 1MB",
    "requestId": "req_abc123xyz",
    "timestamp": "2025-10-19T14:30:00.000Z",
    "details": [
      {
        "field": "payload",
        "message": "Size: 1.5MB, Max: 1MB"
      }
    ]
  }
}
```

#### 422 Unprocessable Entity

**Quando:** Validação de negócio falha (emails inválidos, CPF/CNPJ inválido, etc.)

**Exemplo:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed for one or more fields",
    "requestId": "req_abc123xyz",
    "timestamp": "2025-10-19T14:30:00.000Z",
    "details": [
      {
        "field": "recipient.cpfCnpj",
        "message": "Invalid CPF: check digits do not match",
        "value": "12345678901"
      },
      {
        "field": "recipient.email",
        "message": "Email must match 'to' field",
        "value": "different@example.com"
      }
    ]
  }
}
```

#### 429 Too Many Requests

**Quando:** Rate limit excedido

**Headers:**
```text
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1634567890
Retry-After: 60
```

**Body:**
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 60 seconds",
    "requestId": "req_abc123xyz",
    "timestamp": "2025-10-19T14:30:00.000Z",
    "details": [
      {
        "field": "company_id",
        "message": "Limit: 100 requests/minute, Current: 101"
      }
    ]
  }
}
```

### 5xx Erros de Servidor

#### 500 Internal Server Error

**Quando:** Erro inesperado no servidor

**Exemplo:**
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred. Please try again",
    "requestId": "req_abc123xyz",
    "timestamp": "2025-10-19T14:30:00.000Z"
  }
}
```

#### 503 Service Unavailable

**Quando:** Redis/Postgres indisponível

**Exemplo:**
```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Service temporarily unavailable. Please retry",
    "requestId": "req_abc123xyz",
    "timestamp": "2025-10-19T14:30:00.000Z",
    "details": [
      {
        "service": "redis",
        "message": "Connection timeout"
      }
    ]
  }
}
```

## Idempotência

### Objetivo

Garantir que múltiplas requisições com a mesma chave produzam o mesmo resultado, evitando duplicações.

### Chaves de Idempotência

Existem **duas formas** de garantir idempotência:

1. **Header `Idempotency-Key`** (recomendado)
2. **Campo `externalId`** no payload

### Comportamento

#### Requisição Nova

1. Cliente envia requisição com `Idempotency-Key: idp_123abc`
2. Sistema verifica: chave não existe
3. Sistema processa: cria `outboxId`, `jobId`, enfileira
4. Sistema armazena: mapeia `idp_123abc` → `outboxId`
5. Retorna: `202 Accepted` com `outboxId`, `jobId`

#### Requisição Duplicada (Equivalente)

1. Cliente reenvia **mesma** requisição com `Idempotency-Key: idp_123abc`
2. Sistema verifica: chave existe, payload é equivalente
3. Sistema **NÃO** cria novo job
4. Retorna: `202 Accepted` com **mesmos** `outboxId`, `jobId` da requisição original

#### Requisição Duplicada (Divergente)

1. Cliente reenvia requisição com `Idempotency-Key: idp_123abc` **mas** payload diferente
2. Sistema verifica: chave existe, payload é diferente
3. Retorna: `409 Conflict` com detalhes do conflito

### Equivalência de Payload

Dois payloads são considerados equivalentes se:
- `to`, `subject`, `html` são idênticos
- `recipient` (se fornecido) é idêntico
- Campos opcionais (`cc`, `bcc`, `tags`, etc.) são idênticos ou ambos ausentes

**Nota:** Campos não essenciais como `X-Request-Id` não afetam a equivalência.

### Armazenamento

- **Tabela:** `idempotency_keys`
- **Campos:**
  - `key` (string, unique)
  - `company_id` (uuid, fk)
  - `outbox_id` (uuid, fk)
  - `payload_hash` (sha256)
  - `created_at` (timestamp)
  - `expires_at` (timestamp)
- **TTL:** 24 horas (após esse período, a chave expira e pode ser reutilizada)

### Recomendações

- **SEMPRE** usar `Idempotency-Key` para operações críticas
- Gerar chaves únicas por requisição (ex: UUID v4)
- Formato recomendado: `idp_<uuid>` ou `<namespace>_<uuid>`
- Não reutilizar chaves entre requisições diferentes

## Rate Limiting

### Estratégia

Rate limiting é aplicado **por empresa** (`company_id`) para prevenir abuso e garantir estabilidade.

### Limites (MVP)

| Janela | Limite | Descrição |
|--------|--------|-----------|
| 1 minuto | 100 requisições | Burst curto |
| 1 hora | 2.000 requisições | Operação normal |
| 1 dia | 10.000 requisições | Limite diário |

**Nota:** Limites podem ser ajustados por empresa via configuração no banco.

### Implementação

- **Camada:** Nginx + middleware da API
- **Algoritmo:** Token Bucket ou Sliding Window
- **Storage:** Redis (chaves: `ratelimit:<company_id>:<window>`)

### Headers de Resposta

Todas as respostas (sucesso e erro) incluem headers de rate limit:

```text
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1634567890
```

- `X-RateLimit-Limit`: Limite da janela atual
- `X-RateLimit-Remaining`: Requisições restantes
- `X-RateLimit-Reset`: Unix timestamp da renovação do limite

### Resposta ao Exceder Limite

**Status:** `429 Too Many Requests`

**Headers:**
```text
Retry-After: 60
```

**Body:** (ver seção [429 Too Many Requests](#429-too-many-requests))

### Estratégia de Backoff do Cliente

Ao receber `429`, o cliente deve:

1. Ler header `Retry-After`
2. Aguardar o tempo especificado
3. Implementar backoff exponencial se múltiplos `429` consecutivos
4. Limite de retries: 3-5 tentativas

**Exemplo de backoff:**
- 1ª tentativa: aguarda `Retry-After` (ex: 60s)
- 2ª tentativa: aguarda `Retry-After * 2` (ex: 120s)
- 3ª tentativa: aguarda `Retry-After * 4` (ex: 240s)

## Exemplos

### Exemplo 1: Envio Básico (Mínimo)

**Request:**

```http
POST /v1/email/send HTTP/1.1
Host: api.emailgateway.com
Content-Type: application/json
X-API-Key: sk_live_abc123xyz

{
  "to": "cliente@exemplo.com",
  "subject": "Seu Boleto - Vencimento 15/02/2025",
  "html": "<html><body><h1>Boleto Bancário</h1><p>Valor: R$ 150,00</p></body></html>"
}
```

**Response:**

```http
HTTP/1.1 202 Accepted
Content-Type: application/json
X-Request-Id: req_7f8a9b0c1d2e3f4

{
  "outboxId": "550e8400-e29b-41d4-a716-446655440000",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "requestId": "req_7f8a9b0c1d2e3f4",
  "status": "ENQUEUED",
  "receivedAt": "2025-10-19T14:30:00.000Z"
}
```

### Exemplo 2: Envio Completo (Com Recipient)

**Request:**

```http
POST /v1/email/send HTTP/1.1
Host: api.emailgateway.com
Content-Type: application/json
X-API-Key: sk_live_abc123xyz
Idempotency-Key: idp_a1b2c3d4e5f6
X-Request-Id: req_custom_12345

{
  "to": "cliente@exemplo.com",
  "cc": ["gerente@exemplo.com"],
  "subject": "Boleto Mensal - Janeiro 2025",
  "html": "<html><body><h1>Boleto</h1><p>Referente ao mês de Janeiro/2025</p></body></html>",
  "replyTo": "financeiro@empresa.com",
  "headers": {
    "X-Custom-Invoice": "INV-2025-001",
    "X-Priority": "1"
  },
  "tags": ["boleto", "mensal", "janeiro"],
  "recipient": {
    "externalId": "CUST-98765",
    "cpfCnpj": "12345678901",
    "nome": "João da Silva",
    "email": "cliente@exemplo.com"
  },
  "externalId": "SEND-2025-001"
}
```

**Response:**

```http
HTTP/1.1 202 Accepted
Content-Type: application/json
X-Request-Id: req_custom_12345
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1634567890

{
  "outboxId": "660f9511-f3ac-52e5-b827-557766551111",
  "jobId": "660f9511-f3ac-52e5-b827-557766551111",
  "requestId": "req_custom_12345",
  "status": "ENQUEUED",
  "receivedAt": "2025-10-19T14:35:00.000Z",
  "recipient": {
    "externalId": "CUST-98765"
  }
}
```

### Exemplo 3: Erro de Validação

**Request:**

```http
POST /v1/email/send HTTP/1.1
Host: api.emailgateway.com
Content-Type: application/json
X-API-Key: sk_live_abc123xyz

{
  "to": "email-invalido",
  "subject": "",
  "html": "<html><body>Conteúdo</body></html>",
  "recipient": {
    "cpfCnpj": "123456",
    "email": "diferente@exemplo.com"
  }
}
```

**Response:**

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json
X-Request-Id: req_7f8a9b0c1d2e3f5

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed for one or more fields",
    "requestId": "req_7f8a9b0c1d2e3f5",
    "timestamp": "2025-10-19T14:40:00.000Z",
    "details": [
      {
        "field": "to",
        "message": "Invalid email format",
        "value": "email-invalido"
      },
      {
        "field": "subject",
        "message": "Subject must be between 1 and 150 characters",
        "value": ""
      },
      {
        "field": "recipient.cpfCnpj",
        "message": "CPF must have 11 digits or CNPJ must have 14 digits",
        "value": "123456"
      },
      {
        "field": "recipient.email",
        "message": "Email must match 'to' field",
        "value": "diferente@exemplo.com"
      }
    ]
  }
}
```

### Exemplo 4: Rate Limit Excedido

**Request:**

```http
POST /v1/email/send HTTP/1.1
Host: api.emailgateway.com
Content-Type: application/json
X-API-Key: sk_live_abc123xyz

{
  "to": "cliente@exemplo.com",
  "subject": "Boleto",
  "html": "<html><body>Conteúdo</body></html>"
}
```

**Response:**

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
X-Request-Id: req_7f8a9b0c1d2e3f6
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1634567890
Retry-After: 60

{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 60 seconds",
    "requestId": "req_7f8a9b0c1d2e3f6",
    "timestamp": "2025-10-19T14:45:00.000Z",
    "details": [
      {
        "field": "company_id",
        "message": "Limit: 100 requests/minute, Current: 101"
      }
    ]
  }
}
```

### Exemplo 5: Idempotência (Requisição Duplicada)

**1ª Request:**

```http
POST /v1/email/send HTTP/1.1
Host: api.emailgateway.com
Content-Type: application/json
X-API-Key: sk_live_abc123xyz
Idempotency-Key: idp_unique_123

{
  "to": "cliente@exemplo.com",
  "subject": "Boleto",
  "html": "<html><body>Conteúdo</body></html>"
}
```

**1ª Response:**

```http
HTTP/1.1 202 Accepted
Content-Type: application/json
X-Request-Id: req_7f8a9b0c1d2e3f7

{
  "outboxId": "770fa622-g4bd-63f6-c938-668877662222",
  "jobId": "770fa622-g4bd-63f6-c938-668877662222",
  "requestId": "req_7f8a9b0c1d2e3f7",
  "status": "ENQUEUED",
  "receivedAt": "2025-10-19T14:50:00.000Z"
}
```

**2ª Request (Mesma):**

```http
POST /v1/email/send HTTP/1.1
Host: api.emailgateway.com
Content-Type: application/json
X-API-Key: sk_live_abc123xyz
Idempotency-Key: idp_unique_123

{
  "to": "cliente@exemplo.com",
  "subject": "Boleto",
  "html": "<html><body>Conteúdo</body></html>"
}
```

**2ª Response (Mesmos IDs):**

```http
HTTP/1.1 202 Accepted
Content-Type: application/json
X-Request-Id: req_7f8a9b0c1d2e3f8

{
  "outboxId": "770fa622-g4bd-63f6-c938-668877662222",
  "jobId": "770fa622-g4bd-63f6-c938-668877662222",
  "requestId": "req_7f8a9b0c1d2e3f8",
  "status": "ENQUEUED",
  "receivedAt": "2025-10-19T14:50:00.000Z"
}
```

**3ª Request (Diferente):**

```http
POST /v1/email/send HTTP/1.1
Host: api.emailgateway.com
Content-Type: application/json
X-API-Key: sk_live_abc123xyz
Idempotency-Key: idp_unique_123

{
  "to": "outro@exemplo.com",
  "subject": "Outro Boleto",
  "html": "<html><body>Conteúdo Diferente</body></html>"
}
```

**3ª Response (Conflito):**

```http
HTTP/1.1 409 Conflict
Content-Type: application/json
X-Request-Id: req_7f8a9b0c1d2e3f9

{
  "error": {
    "code": "CONFLICT",
    "message": "Idempotency key already used with different payload",
    "requestId": "req_7f8a9b0c1d2e3f9",
    "timestamp": "2025-10-19T14:55:00.000Z",
    "details": [
      {
        "field": "Idempotency-Key",
        "message": "Key 'idp_unique_123' was used with different request body"
      }
    ]
  }
}
```

## Códigos de Erro

### Referência Rápida

| Código HTTP | Código Interno | Descrição | Ação do Cliente |
|-------------|----------------|-----------|-----------------|
| 200 | - | Nunca usado (endpoint é async) | - |
| 202 | - | Aceito e enfileirado | Aguardar processamento |
| 400 | `BAD_REQUEST` | Payload malformado | Corrigir payload |
| 401 | `UNAUTHORIZED` | API Key inválida | Verificar credenciais |
| 403 | `FORBIDDEN` | IP não autorizado | Contatar suporte |
| 409 | `CONFLICT` | Conflito de idempotência | Verificar `Idempotency-Key` |
| 413 | `PAYLOAD_TOO_LARGE` | Payload > 1MB | Reduzir tamanho do HTML |
| 422 | `VALIDATION_ERROR` | Validação falhou | Corrigir campos inválidos |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit excedido | Aguardar e tentar novamente |
| 500 | `INTERNAL_ERROR` | Erro interno | Tentar novamente |
| 503 | `SERVICE_UNAVAILABLE` | Serviço indisponível | Tentar novamente com backoff |

### Mapeamento de Cenários

| Cenário | Status | Código | Ação |
|---------|--------|--------|------|
| Sucesso | 202 | - | Aguardar |
| Campo obrigatório faltando | 400 | `BAD_REQUEST` | Adicionar campo |
| JSON inválido | 400 | `BAD_REQUEST` | Corrigir JSON |
| API Key ausente | 401 | `UNAUTHORIZED` | Adicionar header |
| API Key inválida | 401 | `UNAUTHORIZED` | Verificar chave |
| IP não autorizado | 403 | `FORBIDDEN` | Contatar admin |
| Idempotency-Key duplicada | 409 | `CONFLICT` | Nova chave ou aceitar resposta |
| HTML > 1MB | 413 | `PAYLOAD_TOO_LARGE` | Reduzir HTML |
| Email inválido | 422 | `VALIDATION_ERROR` | Corrigir formato |
| CPF inválido | 422 | `VALIDATION_ERROR` | Validar CPF |
| recipient.email != to | 422 | `VALIDATION_ERROR` | Corrigir inconsistência |
| cc/bcc > 5 | 422 | `VALIDATION_ERROR` | Reduzir lista |
| Rate limit excedido | 429 | `RATE_LIMIT_EXCEEDED` | Aguardar Retry-After |
| Erro inesperado | 500 | `INTERNAL_ERROR` | Retry com backoff |
| Redis/Postgres down | 503 | `SERVICE_UNAVAILABLE` | Retry com backoff |

## Consultas e Status

Para consultar o status de um envio após receber o `202 Accepted`, utilize:

### GET /v1/emails/{id}

**Endpoint:** `GET /v1/emails/{outboxId}`

**Headers:**
```text
X-API-Key: sk_live_abc123xyz
```

**Response:**
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
  "sesMessageId": "0100018c5f1e2a3b-abc12345-def6-7890-abcd-ef1234567890-000000",
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
      "type": "PROCESSING",
      "timestamp": "2025-10-19T14:30:10.000Z"
    },
    {
      "type": "SENT",
      "timestamp": "2025-10-19T14:30:15.000Z",
      "metadata": {
        "sesMessageId": "0100018c5f1e2a3b-abc12345-def6-7890-abcd-ef1234567890-000000"
      }
    }
  ]
}
```

**Possíveis Status:**
- `PENDING`: Aguardando processamento
- `ENQUEUED`: Na fila
- `PROCESSING`: Sendo processado
- `SENT`: Enviado com sucesso
- `FAILED`: Falha permanente
- `RETRYING`: Em retry após falha temporária

### GET /v1/emails (Lista com Filtros)

**Endpoint:** `GET /v1/emails`

**Query Parameters:**
- `status`: Filtrar por status
- `dateFrom`, `dateTo`: Filtrar por período
- `to`: Filtrar por destinatário
- `recipientExternalId`: Filtrar por ID externo do recipient
- `cpfCnpj`: Filtrar por CPF/CNPJ (será aplicado hash)
- `razaoSocial`: Filtrar por razão social
- `nome`: Filtrar por nome
- `externalId`: Filtrar por ID externo do envio
- `page`, `pageSize`: Paginação
- `sort`: Ordenação (default: `createdAt:desc`)

**Exemplo:**
```http
GET /v1/emails?status=SENT&dateFrom=2025-10-01&dateTo=2025-10-31&page=1&pageSize=20 HTTP/1.1
Host: api.emailgateway.com
X-API-Key: sk_live_abc123xyz
```

## Considerações de Segurança

### Proteção de PII

- **CPF/CNPJ**:
  - Armazenado **cifrado** (AES-256-GCM)
  - Hash (SHA-256) para busca
  - **NUNCA** logar em claro
  - Exibir **mascarado** no dashboard e APIs

- **Dados Sensíveis no HTML**:
  - Sanitizar antes de armazenar
  - Aplicar CSP ao visualizar
  - Limitar acesso via Basic Auth (dashboard)

### Best Practices

1. **TLS Obrigatório**: Todas requisições devem ser HTTPS
2. **API Key Rotation**: Rotacionar chaves periodicamente
3. **IP Allowlist**: Configurar para parceiros quando possível
4. **Rate Limiting**: Prevenir abuso
5. **Input Validation**: Validar todos os campos
6. **Output Encoding**: Sanitizar HTML ao exibir
7. **Logging Seguro**: Não logar PII em claro
8. **Audit Trail**: Logar todas operações críticas

## Referências

- [Arquitetura do Sistema](../architecture/01-visao-geral-sistema.md)
- [Autenticação e Segurança](./02-auth-security.md)
- [Modelos de Erro](./05-error-models-retries.md)
- [Rate Limits](./06-rate-limits.md)
- [Data Model](../data/01-domain-data-model.md)
- [Retry Strategy](../worker/02-retry-strategy.md)

---

**Versão:** 1.0.0
**Status:** Em Desenvolvimento
**Última atualização:** 2025-10-19
**Próxima revisão:** Após implementação do MVP
