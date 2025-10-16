# 01-endpoints-api

> **Tipo:** API
> **Status:** Rascunho
> **Última atualização:** 2025-01-16
> **Responsável:** Equipe de Desenvolvimento

## Visão Geral

Documentação dos endpoints da API REST para envio de boletos por e-mail.

## Endpoints Principais

### POST /v1/email/send

Envia um boleto por e-mail.

**Request Body:**

```json
{
  "recipient": {
    "email": "cliente@exemplo.com",
    "name": "João Silva"
  },
  "boleto": {
    "number": "123456789",
    "amount": 1500.00,
    "dueDate": "2025-02-15"
  },
  "template": "boleto-padrao"
}
```

**Response:**

```json
{
  "jobId": "uuid-do-job",
  "status": "queued",
  "estimatedDelivery": "2025-01-16T10:05:00Z"
}
```

### GET /v1/email/status/:jobId

Consulta o status de um job de envio.

**Response:**

```json
{
  "jobId": "uuid-do-job",
  "status": "sent",
  "sentAt": "2025-01-16T10:03:00Z",
  "recipient": "cliente@exemplo.com"
}
```

## Códigos de Status

- `queued`: Job enfileirado para processamento
- `processing`: Job sendo processado
- `sent`: E-mail enviado com sucesso
- `failed`: Falha no envio
- `retrying`: Tentando reenviar após falha

## Autenticação

Todos os endpoints requerem autenticação via JWT token no header:

```text
Authorization: Bearer <jwt-token>
```

## Rate Limiting

- 100 requests por minuto por cliente
- 1000 requests por hora por cliente

## Validação

Todos os inputs são validados usando Zod schemas antes do processamento.

---

**Template version:** 1.0
**Last updated:** 2025-01-16
