# Code Quality Standards - Email Gateway

**Versão:** 1.0
**Última atualização:** 2025-10-20
**Aplica-se a:** Todas as tasks a partir de TASK 7.1

---

## 🎯 Objetivo

Este documento define os padrões de qualidade de código que **TODOS** os desenvolvedores e agentes de IA devem seguir ao contribuir para o projeto Email Gateway.

**Critério de Aceite:** Código só será aceito em PRs se seguir TODOS os padrões abaixo.

---

## 📋 Índice

- [1. Exception Handling (Tratamento de Erros)](#1-exception-handling)
- [2. Logging (Estruturado)](#2-logging-estruturado)
- [3. Request Tracking (Correlation IDs)](#3-request-tracking)
- [4. Configuration Management](#4-configuration-management)
- [5. Code Organization](#5-code-organization)
- [6. TypeScript Best Practices](#6-typescript-best-practices)
- [7. Security Standards](#7-security-standards)
- [8. Performance Guidelines](#8-performance-guidelines)

---

## 1. Exception Handling

### 1.1 Global Exception Filter (API)

**OBRIGATÓRIO:** Todas as APIs NestJS devem usar um filtro global de exceções.

**Localização:** `apps/api/src/filters/http-exception.filter.ts`

```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorCode = this.getErrorCode(exception);
    const message = this.getErrorMessage(exception);
    const requestId = request.headers['x-request-id'] as string || 'unknown';

    // Structured error response
    const errorResponse = {
      error: {
        code: errorCode,
        message: message,
        requestId: requestId,
        timestamp: new Date().toISOString(),
        path: request.url,
      }
    };

    // Structured logging (NEVER log sensitive data)
    this.logger.error({
      errorCode,
      message,
      requestId,
      method: request.method,
      path: request.url,
      statusCode: status,
      companyId: (request as any).companyId,
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    // NEVER expose stack traces in production
    if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
      (errorResponse.error as any).stack = exception.stack;
    }

    response.status(status).json(errorResponse);
  }

  private getErrorCode(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && 'code' in response) {
        return (response as any).code;
      }
      return exception.constructor.name;
    }
    return 'INTERNAL_SERVER_ERROR';
  }

  private getErrorMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') return response;
      if (typeof response === 'object' && 'message' in response) {
        return (response as any).message;
      }
    }
    if (exception instanceof Error) {
      return exception.message;
    }
    return 'Internal server error';
  }
}
```

**Aplicar globalmente em `main.ts`:**

```typescript
import { AllExceptionsFilter } from './filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(3000);
}
```

### 1.2 Custom Business Exceptions

**Padrão:** Criar exceções customizadas para erros de negócio.

```typescript
// apps/api/src/exceptions/business.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message }, status);
  }
}

// Exemplos de uso
export class EmailNotFoundException extends BusinessException {
  constructor(emailId: string) {
    super('EMAIL_NOT_FOUND', `Email with ID ${emailId} not found`, HttpStatus.NOT_FOUND);
  }
}

export class InvalidRecipientException extends BusinessException {
  constructor(recipient: string) {
    super('INVALID_RECIPIENT', `Recipient ${recipient} is invalid`);
  }
}

export class QuotaExceededException extends BusinessException {
  constructor(companyId: string) {
    super('QUOTA_EXCEEDED', `Company ${companyId} has exceeded rate limit`, HttpStatus.TOO_MANY_REQUESTS);
  }
}
```

### 1.3 Worker Error Handling

**Padrão:** Workers devem capturar erros e decidir se deve fazer retry ou mover para DLQ.

```typescript
// apps/worker/src/processors/email-send.processor.ts
@Processor('email:send')
export class EmailSendProcessor {
  private readonly logger = new Logger(EmailSendProcessor.name);

  @Process()
  async processEmailJob(job: Job<EmailSendJobData>) {
    const { outboxId, requestId } = job.data;

    try {
      this.logger.log({
        message: 'Processing email job',
        jobId: job.id,
        outboxId,
        requestId,
        attempt: job.attemptsMade + 1,
      });

      // Business logic here
      await this.emailService.processEmail(job.data);

      this.logger.log({
        message: 'Email job completed successfully',
        jobId: job.id,
        outboxId,
        requestId,
      });

    } catch (error) {
      this.logger.error({
        message: 'Email job failed',
        jobId: job.id,
        outboxId,
        requestId,
        error: error.message,
        stack: error.stack,
        attempt: job.attemptsMade + 1,
      });

      // Classify error to decide retry strategy
      if (this.isPermanentError(error)) {
        // Move to DLQ immediately
        throw new UnrecoverableError(error.message);
      }

      // For transient errors, BullMQ will retry automatically
      throw error;
    }
  }

  private isPermanentError(error: Error): boolean {
    const permanentCodes = [
      'INVALID_RECIPIENT',
      'SUPPRESSED_EMAIL',
      'MESSAGE_REJECTED',
    ];
    return permanentCodes.some(code => error.message.includes(code));
  }
}
```

---

## 2. Logging (Estruturado)

### 2.1 Formato Estruturado (JSON)

**OBRIGATÓRIO:** Todos os logs devem ser estruturados em JSON.

**❌ NÃO FAÇA ISSO:**

```typescript
console.log('User created: ' + userId);
this.logger.log(`Email sent to ${recipient}`);
```

**✅ FAÇA ISSO:**

```typescript
this.logger.log({
  message: 'User created successfully',
  userId,
  companyId,
  requestId,
});

this.logger.log({
  message: 'Email sent',
  recipient: maskEmail(recipient), // SEMPRE mascarar PII
  emailId,
  messageId,
  requestId,
});
```

### 2.2 Níveis de Log

Use níveis apropriados:

| Nível | Quando usar | Exemplo |
|-------|-------------|---------|
| `error` | Erros que requerem atenção | Falha ao conectar no banco, SES rejeitou email |
| `warn` | Situações anormais mas recuperáveis | Rate limit próximo do limite, retry agendado |
| `log` | Eventos importantes do sistema | Email enviado, job processado |
| `debug` | Informações de debug (dev only) | Valores de variáveis, estados intermediários |
| `verbose` | Logs muito detalhados (dev only) | Trace completo de execução |

### 2.3 Campos Obrigatórios

Sempre inclua:

- `message`: Descrição clara do evento
- `requestId` ou `jobId`: Para correlação
- `timestamp`: Automático pelo Logger do NestJS

**Para API:**
```typescript
this.logger.log({
  message: 'Email send request received',
  requestId: req.headers['x-request-id'],
  companyId: req.user.companyId,
  endpoint: req.url,
  method: req.method,
});
```

**Para Worker:**
```typescript
this.logger.log({
  message: 'Email job processing started',
  jobId: job.id,
  outboxId: job.data.outboxId,
  requestId: job.data.requestId,
  attempt: job.attemptsMade + 1,
});
```

### 2.4 NUNCA logar dados sensíveis

**❌ NUNCA:**
- Senhas, API keys, tokens
- CPF/CNPJ sem mascaramento
- Email completo (use masking)
- Conteúdo de mensagens
- Dados de pagamento

**✅ SEMPRE:**
- Maskear PII usando utilitários de `@email-gateway/shared`
- Logar apenas IDs (hashes)
- Usar `[REDACTED]` para valores sensíveis

```typescript
import { maskEmail, maskCpfCnpj } from '@email-gateway/shared';

this.logger.log({
  message: 'Recipient validated',
  email: maskEmail(recipient.email), // user@example.com → u***@e***.com
  cpf: recipient.cpfCnpj ? maskCpfCnpj(recipient.cpfCnpj) : undefined,
});
```

---

## 3. Request Tracking (Correlation IDs)

### 3.1 Request ID Middleware (API)

**OBRIGATÓRIO:** Toda requisição deve ter um `x-request-id`.

```typescript
// apps/api/src/middleware/request-id.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Use existing request ID or generate new one
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);

    next();
  }
}
```

**Aplicar em `AppModule`:**

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes('*');
  }
}
```

### 3.2 Propagação de Correlation IDs

**Padrão:** Propagar `requestId` da API → Queue → Worker

```typescript
// API: Ao enfileirar job
await this.queueService.enqueueEmailJob({
  outboxId: email.id,
  requestId: req.headers['x-request-id'], // Propagar!
  // ... outros dados
});

// Worker: Usar em logs
this.logger.log({
  message: 'Processing job',
  jobId: job.id,
  requestId: job.data.requestId, // Mesmo requestId da API!
});
```

---

## 4. Configuration Management

### 4.1 Validação de Environment Variables

**OBRIGATÓRIO:** Validar todas as env vars na inicialização.

```typescript
// apps/api/src/config/env.validation.ts
import { plainToClass } from 'class-transformer';
import { IsEnum, IsNumber, IsString, IsUrl, Min, Max, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  @Min(1024)
  @Max(65535)
  PORT: number;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  REDIS_HOST: string;

  @IsNumber()
  @Min(1)
  @Max(65535)
  REDIS_PORT: number;

  @IsString()
  AWS_REGION: string;

  @IsString()
  AWS_SES_FROM_EMAIL: string;

  @IsString()
  ENCRYPTION_KEY: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Config validation error: ${errors.toString()}`);
  }

  return validatedConfig;
}
```

**Usar em `AppModule`:**

```typescript
import { validate } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate,
      isGlobal: true,
    }),
  ],
})
export class AppModule {}
```

### 4.2 Configuration Service

```typescript
// apps/api/src/config/app.config.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  get nodeEnv(): string {
    return this.configService.get<string>('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get port(): number {
    return this.configService.get<number>('PORT');
  }

  get database() {
    return {
      url: this.configService.get<string>('DATABASE_URL'),
    };
  }

  get redis() {
    return {
      host: this.configService.get<string>('REDIS_HOST'),
      port: this.configService.get<number>('REDIS_PORT'),
      password: this.configService.get<string>('REDIS_PASSWORD'),
    };
  }

  get aws() {
    return {
      region: this.configService.get<string>('AWS_REGION'),
      sesFromEmail: this.configService.get<string>('AWS_SES_FROM_EMAIL'),
    };
  }
}
```

---

## 5. Code Organization

### 5.1 Estrutura de Módulos NestJS

```
apps/api/src/modules/email/
├── controllers/
│   └── email.controller.ts
├── services/
│   ├── email-send.service.ts
│   └── email-query.service.ts
├── dto/
│   ├── send-email.dto.ts
│   └── email-response.dto.ts
├── guards/
│   └── api-key.guard.ts
├── interceptors/
│   └── logging.interceptor.ts
├── email.module.ts
└── email.module.spec.ts
```

### 5.2 Single Responsibility Principle

**❌ NÃO FAÇA ISSO:**

```typescript
// Serviço fazendo TUDO
class EmailService {
  async sendEmail() { /* validação + envio + log + metrics */ }
}
```

**✅ FAÇA ISSO:**

```typescript
// Serviços focados
class EmailValidationService {
  validateRecipient() { /* apenas validação */ }
}

class EmailSendService {
  async sendEmail() { /* apenas lógica de envio */ }
}

class EmailMetricsService {
  recordEmailSent() { /* apenas métricas */ }
}
```

### 5.3 Dependency Injection

**Sempre use DI do NestJS:**

```typescript
@Injectable()
export class EmailSendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly metricsService: MetricsService,
    private readonly logger: Logger,
  ) {}
}
```

---

## 6. TypeScript Best Practices

### 6.1 Strict Type Safety

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
  }
}
```

### 6.2 Avoid `any`

**❌ NÃO:**
```typescript
function process(data: any) { }
```

**✅ SIM:**
```typescript
interface EmailData {
  recipient: string;
  subject: string;
}

function process(data: EmailData) { }
```

### 6.3 Use `unknown` para valores desconhecidos

```typescript
function parseJson(text: string): unknown {
  return JSON.parse(text);
}

// Depois validar
const data = parseJson(text);
if (isEmailData(data)) {
  // Type guard
  process(data);
}
```

---

## 7. Security Standards

### 7.1 Encryption

**SEMPRE use as funções corretas de `@email-gateway/shared`:**

```typescript
import { encryptCpfCnpj, decryptCpfCnpj } from '@email-gateway/shared';

// ✅ Correto
const { encrypted, salt } = encryptCpfCnpj(cpfCnpj, password);

// ❌ NUNCA use crypto.createCipher (DEPRECATED e INSEGURO)
const cipher = crypto.createCipher('aes-256-cbc', key); // NÃO!
```

### 7.2 Input Validation

**Use class-validator em todos os DTOs:**

```typescript
import { IsEmail, IsString, MaxLength, IsOptional } from 'class-validator';

export class SendEmailDto {
  @IsEmail()
  recipient: string;

  @IsString()
  @MaxLength(200)
  subject: string;

  @IsOptional()
  @IsString()
  cpfCnpj?: string;
}
```

### 7.3 Rate Limiting

```typescript
// Aplicar rate limiting em rotas sensíveis
@UseGuards(ThrottlerGuard)
@Throttle(60, 60) // 60 requests per 60 seconds
@Post('send')
async sendEmail() { }
```

---

## 8. Performance Guidelines

### 8.1 Database Queries

**Sempre use índices corretos:**

```typescript
// ✅ Query otimizada com índice
const emails = await prisma.emailOutbox.findMany({
  where: {
    companyId,
    status: 'SENT',
  },
  orderBy: { createdAt: 'desc' },
  take: 100,
});

// Index no schema:
// @@index([companyId, status, createdAt])
```

### 8.2 Paginação

**Sempre paginar resultados:**

```typescript
// Cursor-based pagination
const emails = await prisma.emailOutbox.findMany({
  take: limit + 1,
  cursor: cursor ? { id: cursor } : undefined,
  orderBy: { createdAt: 'desc' },
});

const hasMore = emails.length > limit;
const items = hasMore ? emails.slice(0, -1) : emails;
```

### 8.3 Evitar N+1 Queries

```typescript
// ❌ N+1 problem
const emails = await prisma.emailOutbox.findMany();
for (const email of emails) {
  const recipient = await prisma.recipient.findUnique({ where: { id: email.recipientId } });
}

// ✅ Solução: use include
const emails = await prisma.emailOutbox.findMany({
  include: { recipient: true },
});
```

---

## 📝 Checklist de Code Review

Ao revisar código, verificar:

- [ ] Exception handling correto (global filter + custom exceptions)
- [ ] Logs estruturados (JSON) sem PII
- [ ] Request ID propagado em toda a cadeia
- [ ] Environment variables validadas
- [ ] TypeScript strict mode (sem `any`)
- [ ] Input validation com class-validator
- [ ] Queries otimizadas com índices
- [ ] Paginação implementada
- [ ] Encryption usando funções corretas
- [ ] Testes unitários e de integração

---

## 📚 Referências

- [NestJS Best Practices](https://docs.nestjs.com/fundamentals/testing)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [OWASP Security Cheat Sheet](https://cheatsheetseries.owasp.org/)

---

**Última atualização:** 2025-10-20
**Versão:** 1.0
**Mantido por:** Time de Arquitetura
