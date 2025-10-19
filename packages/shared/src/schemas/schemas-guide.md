# Schemas de Validação - POST /v1/email/send

Este diretório contém os schemas Zod e tipos TypeScript para validação do endpoint `POST /v1/email/send`.

## Arquivos

### `email-send.schema.ts`

Contém os schemas Zod para validação de entrada e saída do endpoint, incluindo:

- **Schemas de validação:**
  - `emailSendBodySchema`: Validação do corpo da requisição
  - `emailSendHeadersSchema`: Validação dos headers
  - `emailSendResponseSchema`: Schema da resposta 202
  - `errorResponseSchema`: Schema de erros padrão
  - `recipientSchema`: Validação do bloco recipient
  - `customHeadersSchema`: Validação de headers customizados

- **Validadores customizados:**
  - Validação de CPF com dígitos verificadores
  - Validação de CNPJ com dígitos verificadores
  - Validação de email (RFC 5322 básico)
  - Validação de tamanho de payload

- **Utilitários:**
  - `maskCpfCnpj()`: Mascara CPF/CNPJ para exibição
  - `hashCpfCnpj()`: Gera hash SHA-256 para busca
  - `normalizeCpfCnpj()`: Remove pontuação
  - `sanitizeSubject()`: Remove quebras de linha
  - `generateRequestId()`: Gera ID único de requisição

### `email-send.types.ts`

Contém tipos TypeScript complementares, incluindo:

- **Enums:**
  - `EmailStatus`: Status do envio
  - `EmailEventType`: Tipos de eventos
  - `ErrorCode`: Códigos de erro
  - `FailureReason`: Motivos de falha

- **Interfaces de domínio:**
  - `IRecipient`: Destinatário
  - `IEmailOutbox`: Registro na tabela outbox
  - `IEmailLog`: Registro de log
  - `IEmailEvent`: Evento
  - `IEmailJob`: Job na fila
  - `ICompany`: Empresa/parceiro
  - `IIdempotencyKey`: Chave de idempotência

- **Interfaces de resposta:**
  - `IEmailDetailResponse`: Resposta de GET /v1/emails/{id}
  - `IEmailListResponse`: Resposta de GET /v1/emails
  - `IEmailListFilters`: Filtros de listagem

- **Type Guards:**
  - `isTerminalStatus()`: Verifica se status é terminal
  - `isTemporaryFailure()`: Verifica se falha é temporária
  - `isPermanentFailure()`: Verifica se falha é permanente

## Como Usar

### 1. Validação de Requisição (Controller)

```typescript
import {
  emailSendBodySchema,
  emailSendHeadersSchema,
  EmailSendBody,
  EmailSendHeaders,
} from './email-send.schema';

// Em um controller NestJS
@Post('/v1/email/send')
async sendEmail(
  @Body() body: unknown,
  @Headers() headers: unknown,
) {
  // Validar headers
  const validatedHeaders = emailSendHeadersSchema.parse(headers);

  // Validar body
  const validatedBody = emailSendBodySchema.parse(body);

  // Processar...
}
```

### 2. Validação com Tratamento de Erros

```typescript
import { z } from 'zod';
import { emailSendBodySchema, ErrorCode } from './email-send.schema';

try {
  const data = emailSendBodySchema.parse(requestBody);
  // Dados validados
} catch (error) {
  if (error instanceof z.ZodError) {
    // Mapear erros Zod para formato de resposta padrão
    const details = error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
      value: err.input,
    }));

    return {
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed for one or more fields',
        requestId: req.id,
        timestamp: new Date().toISOString(),
        details,
      },
    };
  }
}
```

### 3. Uso de Utilitários

```typescript
import {
  maskCpfCnpj,
  hashCpfCnpj,
  normalizeCpfCnpj,
  generateRequestId,
} from './email-send.schema';

// Normalizar CPF/CNPJ
const normalized = normalizeCpfCnpj('123.456.789-01'); // '12345678901'

// Gerar hash para busca
const hash = await hashCpfCnpj('12345678901'); // SHA-256 hex

// Mascarar para exibição
const masked = maskCpfCnpj('12345678901'); // '***.456.789-**'

// Gerar Request ID
const requestId = generateRequestId(); // 'req_1634567890_abc123'
```

### 4. Type Guards

```typescript
import {
  EmailStatus,
  isTerminalStatus,
  isProcessingStatus,
  isTemporaryFailure,
  FailureReason,
} from './email-send.types';

const status = EmailStatus.SENT;

if (isTerminalStatus(status)) {
  // Status não vai mais mudar
  console.log('E-mail já foi processado');
}

if (isProcessingStatus(status)) {
  // Ainda em processamento
  console.log('E-mail ainda está sendo processado');
}

const reason = FailureReason.SES_TEMPORARY;

if (isTemporaryFailure(reason)) {
  // Pode tentar novamente
  console.log('Falha temporária, será reprocessado');
}
```

### 5. Interfaces de Domínio

```typescript
import { IEmailOutbox, IRecipient, EmailStatus } from './email-send.types';

// Criar registro no outbox
const outbox: IEmailOutbox = {
  id: uuidv4(),
  companyId: company.id,
  recipientId: recipient?.id,
  externalId: data.externalId,
  to: data.to,
  cc: data.cc,
  bcc: data.bcc,
  subject: data.subject,
  htmlRef: data.html, // MVP: inline
  replyTo: data.replyTo,
  headers: data.headers,
  tags: data.tags,
  status: EmailStatus.PENDING,
  requestId: req.id,
  idempotencyKey: req.headers['idempotency-key'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Upsert do recipient
const recipient: IRecipient = {
  id: uuidv4(),
  companyId: company.id,
  externalId: data.recipient?.externalId,
  cpfCnpjHash: data.recipient?.cpfCnpj ? await hashCpfCnpj(data.recipient.cpfCnpj) : undefined,
  // cpfCnpjEnc: cifrado com KMS
  razaoSocial: data.recipient?.razaoSocial,
  nome: data.recipient?.nome,
  email: data.to,
  createdAt: new Date(),
  updatedAt: new Date(),
};
```

### 6. Pipe de Validação NestJS

```typescript
import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors,
      });
    }
  }
}

// Uso no controller
@Post('/v1/email/send')
async sendEmail(
  @Body(new ZodValidationPipe(emailSendBodySchema)) body: EmailSendBody,
) {
  // Body já validado
}
```

### 7. Resposta 202 Accepted

```typescript
import { EmailSendResponse, EmailStatus } from './email-send.schema';

const response: EmailSendResponse = {
  outboxId: outbox.id,
  jobId: outbox.id, // jobId = outboxId
  requestId: req.id,
  status: 'ENQUEUED',
  receivedAt: new Date().toISOString(),
  recipient: data.recipient?.externalId
    ? { externalId: data.recipient.externalId }
    : undefined,
};

return res.status(202).json(response);
```

### 8. Tratamento de Erros Padrão

```typescript
import { ErrorResponse, ErrorCode, ErrorDetail } from './email-send.schema';

function buildErrorResponse(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: ErrorDetail[]
): ErrorResponse {
  return {
    error: {
      code,
      message,
      requestId,
      timestamp: new Date().toISOString(),
      details,
    },
  };
}

// Uso
const errorResponse = buildErrorResponse(
  ErrorCode.VALIDATION_ERROR,
  'Invalid email format',
  req.id,
  [
    {
      field: 'to',
      message: 'Invalid email format',
      value: 'invalid-email',
    },
  ]
);

return res.status(422).json(errorResponse);
```

## Validações Importantes

### 1. Tamanho do Payload

```typescript
import { validatePayloadSize, LIMITS } from './email-send.schema';

const rawBody = JSON.stringify(body);

if (!validatePayloadSize(rawBody)) {
  return res.status(413).json({
    error: {
      code: 'PAYLOAD_TOO_LARGE',
      message: `Request payload exceeds maximum size of ${LIMITS.MAX_PAYLOAD_SIZE} bytes`,
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  });
}
```

### 2. Consistência recipient.email vs to

Esta validação já está incluída no `emailSendBodySchema`:

```typescript
// O schema automaticamente valida que recipient.email === to
const data = emailSendBodySchema.parse(body);
// Se recipient.email !== to, lança ZodError
```

### 3. Validação de CPF/CNPJ

```typescript
import { cpfCnpjSchema } from './email-send.schema';

try {
  const validCpfCnpj = cpfCnpjSchema.parse('12345678901');
  // CPF válido com dígitos verificadores corretos
} catch (error) {
  // CPF inválido
}
```

## Testes

### Exemplo de Teste com Zod

```typescript
import { describe, it, expect } from 'vitest';
import { emailSendBodySchema, recipientSchema } from './email-send.schema';

describe('emailSendBodySchema', () => {
  it('should validate valid body', () => {
    const validBody = {
      to: 'test@example.com',
      subject: 'Test',
      html: '<html><body>Test</body></html>',
    };

    const result = emailSendBodySchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it('should fail for invalid email', () => {
    const invalidBody = {
      to: 'invalid-email',
      subject: 'Test',
      html: '<html><body>Test</body></html>',
    };

    const result = emailSendBodySchema.safeParse(invalidBody);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toEqual(['to']);
    }
  });

  it('should fail when recipient.email !== to', () => {
    const invalidBody = {
      to: 'test@example.com',
      subject: 'Test',
      html: '<html><body>Test</body></html>',
      recipient: {
        email: 'different@example.com',
      },
    };

    const result = emailSendBodySchema.safeParse(invalidBody);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain("must match 'to' field");
    }
  });
});

describe('cpfCnpjSchema', () => {
  it('should validate valid CPF', () => {
    const validCPF = '12345678909'; // CPF válido (exemplo)

    const result = cpfCnpjSchema.safeParse(validCPF);
    expect(result.success).toBe(true);
  });

  it('should fail for invalid CPF check digits', () => {
    const invalidCPF = '12345678901'; // Dígitos verificadores inválidos

    const result = cpfCnpjSchema.safeParse(invalidCPF);
    expect(result.success).toBe(false);
  });
});
```

## Integração com Prisma

### Mapeamento de Tipos

```typescript
import { Prisma } from '@prisma/client';
import { IEmailOutbox, EmailStatus } from './email-send.types';

// Converter de Prisma para interface
function toEmailOutbox(prismaOutbox: Prisma.EmailOutboxGetPayload<{}>): IEmailOutbox {
  return {
    id: prismaOutbox.id,
    companyId: prismaOutbox.companyId,
    recipientId: prismaOutbox.recipientId ?? undefined,
    externalId: prismaOutbox.externalId ?? undefined,
    to: prismaOutbox.to,
    cc: prismaOutbox.cc as string[] | undefined,
    bcc: prismaOutbox.bcc as string[] | undefined,
    subject: prismaOutbox.subject,
    htmlRef: prismaOutbox.htmlRef,
    replyTo: prismaOutbox.replyTo ?? undefined,
    headers: prismaOutbox.headers as Record<string, string> | undefined,
    tags: prismaOutbox.tags as string[] | undefined,
    status: prismaOutbox.status as EmailStatus,
    requestId: prismaOutbox.requestId,
    idempotencyKey: prismaOutbox.idempotencyKey ?? undefined,
    createdAt: prismaOutbox.createdAt,
    updatedAt: prismaOutbox.updatedAt,
  };
}
```

## Considerações de Segurança

### 1. CPF/CNPJ Sensível

```typescript
// NUNCA logar CPF/CNPJ em claro
logger.info('Processing email', {
  to: data.to,
  recipientId: recipient.id,
  // NÃO FAZER: cpfCnpj: data.recipient.cpfCnpj
  cpfCnpjHash: recipient.cpfCnpjHash, // OK: usar hash
});

// Mascarar ao exibir
const displayCpfCnpj = maskCpfCnpj(data.recipient.cpfCnpj);
```

### 2. Sanitização de HTML

```typescript
// TODO: Implementar sanitização antes de armazenar
import DOMPurify from 'isomorphic-dompurify';

const sanitizedHtml = DOMPurify.sanitize(data.html, {
  ALLOWED_TAGS: ['html', 'head', 'body', 'div', 'p', 'span', 'h1', 'h2', 'h3', 'table', 'tr', 'td', 'img'],
  ALLOWED_ATTR: ['style', 'class', 'src', 'alt', 'href'],
});
```

### 3. Rate Limiting

```typescript
import { ICompany } from './email-send.types';

async function checkRateLimit(company: ICompany, clientIp: string): Promise<boolean> {
  // Verificar rate limit no Redis
  const key = `ratelimit:${company.id}:minute`;
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, 60); // Expira em 1 minuto
  }

  return current <= company.rateLimitPerMinute;
}
```

## Referências

- [Contrato da API](../03-email-send-contract.md)
- [Documentação Zod](https://zod.dev/)
- [Validação de CPF/CNPJ](https://www.receita.fazenda.gov.br/)

---

**Versão:** 1.0.0
**Última atualização:** 2025-10-19
