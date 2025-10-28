# Testing Standards - Email Gateway

**Versão:** 1.0
**Última atualização:** 2025-10-20
**Aplica-se a:** Todas as tasks a partir de TASK 7.1

---

## 🎯 Objetivo

Este documento define os padrões obrigatórios de testes que **TODOS** os desenvolvedores e agentes de IA devem seguir ao contribuir para o projeto Email Gateway.

**Critério de Aceite:** Código só será aceito em PRs se tiver cobertura de testes adequada conforme este documento.

---

## 📋 Índice

- [1. Cobertura Obrigatória](#1-cobertura-obrigatória)
- [2. Tipos de Testes](#2-tipos-de-testes)
- [3. Testes Unitários](#3-testes-unitários)
- [4. Testes de Integração](#4-testes-de-integração)
- [5. Testes End-to-End (E2E)](#5-testes-end-to-end-e2e)
- [6. Mocking e Fixtures](#6-mocking-e-fixtures)
- [7. Test Organization](#7-test-organization)
- [8. CI/CD Integration](#8-cicd-integration)

---

## 1. Cobertura Obrigatória

### 1.1 Metas de Cobertura

| Tipo de Código | Cobertura Mínima | Medida por |
|----------------|------------------|------------|
| **Serviços (Services)** | 80% | Linha |
| **Utilitários (Utils)** | 90% | Linha |
| **Controllers** | 70% | Linha |
| **Processors (Workers)** | 80% | Linha |
| **DTOs** | N/A | Validação manual |
| **Overall do projeto** | 70% | Linha |

### 1.2 Comandos de Cobertura

```bash
# Rodar todos os testes com cobertura
npm run test:cov

# Ver relatório de cobertura
open coverage/lcov-report/index.html

# Cobertura por app específica
npm run test:cov --scope=@email-gateway/api
npm run test:cov --scope=@email-gateway/worker
```

### 1.3 Enforcement no CI

**OBRIGATÓRIO:** Pipeline de CI deve falhar se cobertura for menor que 70%.

```yaml
# .github/workflows/test.yml
- name: Run tests with coverage
  run: npm run test:cov

- name: Check coverage thresholds
  run: |
    npm run test:check-coverage --lines 70 --functions 70 --branches 70
```

---

## 2. Tipos de Testes

### 2.1 Pirâmide de Testes

```
        /\
       /E2E\         ← Poucos (5%)
      /------\
     /Integration\   ← Moderados (25%)
    /------------\
   /    Unit      \  ← Muitos (70%)
  /________________\
```

### 2.2 Quando usar cada tipo

| Tipo | Quando usar | Exemplo |
|------|-------------|---------|
| **Unit** | Testar lógica isolada | `maskEmail()`, `validateCpf()`, service methods |
| **Integration** | Testar integração entre componentes | API endpoint + banco, Worker + Redis, SES client |
| **E2E** | Testar fluxo completo | API → Queue → Worker → SES (end-to-end) |

---

## 3. Testes Unitários

### 3.1 Estrutura de Testes Unitários

**Padrão AAA: Arrange, Act, Assert**

```typescript
describe('EmailSendService', () => {
  let service: EmailSendService;
  let prisma: DeepMockProxy<PrismaClient>;
  let queueService: DeepMockProxy<QueueService>;

  beforeEach(() => {
    // Arrange: Setup
    prisma = mockDeep<PrismaClient>();
    queueService = mockDeep<QueueService>();
    service = new EmailSendService(prisma, queueService, new Logger());
  });

  describe('sendEmail', () => {
    it('should create outbox record and enqueue job', async () => {
      // Arrange
      const dto = {
        recipient: 'test@example.com',
        subject: 'Test',
        body: 'Test body',
      };
      const mockOutbox = { id: '123', status: 'PENDING' };

      prisma.emailOutbox.create.mockResolvedValue(mockOutbox as any);
      queueService.enqueueEmailJob.mockResolvedValue();

      // Act
      const result = await service.sendEmail(dto, 'company-1');

      // Assert
      expect(prisma.emailOutbox.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recipient: dto.recipient,
          companyId: 'company-1',
        }),
      });
      expect(queueService.enqueueEmailJob).toHaveBeenCalledWith({
        outboxId: mockOutbox.id,
        requestId: expect.any(String),
      });
      expect(result).toEqual(mockOutbox);
    });

    it('should throw error when recipient is invalid', async () => {
      // Arrange
      const dto = {
        recipient: 'invalid-email',
        subject: 'Test',
        body: 'Test',
      };

      // Act & Assert
      await expect(service.sendEmail(dto, 'company-1')).rejects.toThrow(
        InvalidRecipientException,
      );
    });
  });
});
```

### 3.2 Utilitários de Teste

```typescript
// test/utils/factories.ts
export const createMockEmail = (overrides?: Partial<EmailOutbox>): EmailOutbox => ({
  id: faker.string.uuid(),
  companyId: faker.string.uuid(),
  recipient: faker.internet.email(),
  subject: faker.lorem.sentence(),
  body: faker.lorem.paragraph(),
  status: EmailStatus.PENDING,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Uso
const email = createMockEmail({ status: EmailStatus.SENT });
```

### 3.3 Testes de Validação (DTOs)

```typescript
import { validate } from 'class-validator';
import { SendEmailDto } from './send-email.dto';

describe('SendEmailDto', () => {
  it('should validate correct email', async () => {
    const dto = new SendEmailDto();
    dto.recipient = 'test@example.com';
    dto.subject = 'Test';
    dto.body = 'Body';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid email', async () => {
    const dto = new SendEmailDto();
    dto.recipient = 'invalid-email';
    dto.subject = 'Test';
    dto.body = 'Body';

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('recipient');
  });

  it('should reject subject longer than 200 chars', async () => {
    const dto = new SendEmailDto();
    dto.recipient = 'test@example.com';
    dto.subject = 'a'.repeat(201);
    dto.body = 'Body';

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('maxLength');
  });
});
```

### 3.4 Testes de Utilitários

```typescript
// packages/shared/src/utils/masking.util.spec.ts
import { maskEmail, maskCpfCnpj } from './masking.util';

describe('maskEmail', () => {
  it('should mask short email correctly', () => {
    expect(maskEmail('a@b.com')).toBe('a***@b***.com');
  });

  it('should mask long email correctly', () => {
    expect(maskEmail('user@example.com')).toBe('u***@e***.com');
  });

  it('should handle edge cases', () => {
    expect(maskEmail('')).toBe('');
    expect(maskEmail('invalid')).toBe('invalid');
  });
});

describe('maskCpfCnpj', () => {
  it('should mask CPF', () => {
    expect(maskCpfCnpj('12345678901')).toBe('123.***.***-01');
  });

  it('should mask CNPJ', () => {
    expect(maskCpfCnpj('12345678000190')).toBe('12.***.***/****.90');
  });
});
```

---

## 4. Testes de Integração

### 4.1 Testes de API (Controller + Service + DB)

**Usar `supertest` para testes de API:**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Email API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);

    await app.init();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // Limpar banco de dados antes de cada teste
    await prisma.emailOutbox.deleteMany();
    await prisma.recipient.deleteMany();
  });

  describe('POST /v1/email/send', () => {
    it('should create email and return 201', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', 'test-api-key')
        .send({
          recipient: 'test@example.com',
          subject: 'Test Email',
          body: 'Test body',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        status: 'PENDING',
        recipient: 'test@example.com',
      });

      // Verificar que foi criado no banco
      const email = await prisma.emailOutbox.findUnique({
        where: { id: response.body.id },
      });
      expect(email).toBeDefined();
      expect(email.status).toBe('PENDING');
    });

    it('should return 400 for invalid recipient', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', 'test-api-key')
        .send({
          recipient: 'invalid-email',
          subject: 'Test',
          body: 'Test',
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 without API key', async () => {
      await request(app.getHttpServer())
        .post('/v1/email/send')
        .send({
          recipient: 'test@example.com',
          subject: 'Test',
          body: 'Test',
        })
        .expect(401);
    });

    it('should return 429 when rate limit exceeded', async () => {
      // Fazer 61 requisições (rate limit é 60/min)
      const requests = Array.from({ length: 61 }, () =>
        request(app.getHttpServer())
          .post('/v1/email/send')
          .set('x-api-key', 'test-api-key')
          .send({
            recipient: 'test@example.com',
            subject: 'Test',
            body: 'Test',
          })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r.status === 429);

      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});
```

### 4.2 Testes de Worker (Processor + Service + Queue)

```typescript
import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';
import { EmailSendProcessor } from './email-send.processor';
import { EmailSendService } from '../services/email-send.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EmailSendProcessor', () => {
  let processor: EmailSendProcessor;
  let emailService: EmailSendService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmailSendProcessor,
        EmailSendService,
        PrismaService,
      ],
    }).compile();

    processor = module.get(EmailSendProcessor);
    emailService = module.get(EmailSendService);
    prisma = module.get(PrismaService);
  });

  it('should process email job successfully', async () => {
    // Arrange
    const jobData = {
      outboxId: 'email-123',
      requestId: 'req-456',
    };

    const job = {
      id: 'job-1',
      data: jobData,
      attemptsMade: 0,
    } as Job;

    const email = await prisma.emailOutbox.create({
      data: {
        id: jobData.outboxId,
        recipient: 'test@example.com',
        subject: 'Test',
        body: 'Test',
        status: 'PENDING',
        companyId: 'company-1',
      },
    });

    // Act
    await processor.processEmailJob(job);

    // Assert
    const updatedEmail = await prisma.emailOutbox.findUnique({
      where: { id: jobData.outboxId },
    });

    expect(updatedEmail.status).toBe('SENT');
  });

  it('should move to DLQ after max retries', async () => {
    // Simular falha permanente
    jest.spyOn(emailService, 'processEmail').mockRejectedValue(
      new Error('INVALID_RECIPIENT')
    );

    const job = {
      id: 'job-1',
      data: { outboxId: 'email-123', requestId: 'req-456' },
      attemptsMade: 5,
    } as Job;

    await expect(processor.processEmailJob(job)).rejects.toThrow();
  });
});
```

### 4.3 Testes de Integração com SES (Mock)

```typescript
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { mockClient } from 'aws-sdk-client-mock';

const sesMock = mockClient(SESClient);

describe('SES Integration', () => {
  beforeEach(() => {
    sesMock.reset();
  });

  it('should send email via SES', async () => {
    sesMock.on(SendEmailCommand).resolves({
      MessageId: 'ses-message-id-123',
    });

    const result = await sesService.sendEmail({
      recipient: 'test@example.com',
      subject: 'Test',
      body: 'Test body',
    });

    expect(result.messageId).toBe('ses-message-id-123');
    expect(sesMock.calls()).toHaveLength(1);
  });

  it('should handle SES throttling error', async () => {
    sesMock.on(SendEmailCommand).rejects({
      name: 'Throttling',
      message: 'Maximum sending rate exceeded',
    });

    await expect(
      sesService.sendEmail({
        recipient: 'test@example.com',
        subject: 'Test',
        body: 'Test',
      })
    ).rejects.toThrow('Throttling');
  });
});
```

---

## 5. Testes End-to-End (E2E)

### 5.1 Fluxo Completo (API → Queue → Worker → SES)

```typescript
describe('Email Send Flow (E2E)', () => {
  it('should complete full email sending flow', async () => {
    // 1. Cliente envia requisição para API
    const sendResponse = await request(app.getHttpServer())
      .post('/v1/email/send')
      .set('x-api-key', 'test-api-key')
      .send({
        recipient: 'test@example.com',
        subject: 'E2E Test',
        body: 'Testing end-to-end flow',
      })
      .expect(201);

    const emailId = sendResponse.body.id;

    // 2. Aguardar job ser processado (polling)
    await waitFor(async () => {
      const email = await prisma.emailOutbox.findUnique({
        where: { id: emailId },
      });
      return email.status === 'SENT';
    }, { timeout: 5000 });

    // 3. Verificar email foi enviado
    const email = await prisma.emailOutbox.findUnique({
      where: { id: emailId },
    });
    expect(email.status).toBe('SENT');
    expect(email.sentAt).toBeDefined();

    // 4. Verificar logs foram criados
    const logs = await prisma.emailLog.findMany({
      where: { outboxId: emailId },
    });
    expect(logs.length).toBeGreaterThan(0);

    // 5. Verificar métricas foram registradas
    // (se tiver endpoint de métricas)
  });
});
```

---

## 6. Mocking e Fixtures

### 6.1 Mock de Dependências Externas

**Sempre mockear:**
- SES (AWS SDK)
- Redis (em testes unitários)
- PostgreSQL (em testes unitários)

```typescript
// test/mocks/ses.mock.ts
export const createSESMock = () => ({
  sendEmail: jest.fn().mockResolvedValue({
    MessageId: 'mock-message-id',
  }),
  sendRawEmail: jest.fn(),
});

// Uso
const sesMock = createSESMock();
```

### 6.2 Fixtures de Dados

```typescript
// test/fixtures/email.fixture.ts
export const emailFixtures = {
  validSendRequest: {
    recipient: 'test@example.com',
    subject: 'Test Email',
    body: 'Test body content',
  },

  invalidSendRequest: {
    recipient: 'invalid-email',
    subject: '',
    body: '',
  },

  pendingEmail: {
    id: 'email-123',
    status: EmailStatus.PENDING,
    recipient: 'test@example.com',
    subject: 'Test',
    body: 'Test',
    companyId: 'company-1',
    createdAt: new Date(),
  },
};

// Uso
const email = await prisma.emailOutbox.create({
  data: emailFixtures.pendingEmail,
});
```

---

## 7. Test Organization

### 7.1 Estrutura de Arquivos

```
apps/api/
├── src/
│   └── modules/
│       └── email/
│           ├── email.controller.ts
│           ├── email.controller.spec.ts    ← Unit test
│           ├── email.service.ts
│           └── email.service.spec.ts       ← Unit test
├── test/
│   ├── fixtures/                           ← Test data
│   ├── mocks/                              ← Mock objects
│   ├── utils/                              ← Test utilities
│   └── email.e2e-spec.ts                   ← E2E test
```

### 7.2 Naming Conventions

| Tipo | Sufixo | Exemplo |
|------|--------|---------|
| Unit test | `.spec.ts` | `email.service.spec.ts` |
| Integration test | `.integration.spec.ts` | `email.integration.spec.ts` |
| E2E test | `.e2e-spec.ts` | `email-flow.e2e-spec.ts` |

---

## 8. CI/CD Integration

### 8.1 GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Check coverage
        run: npm run test:check-coverage -- --lines 70

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test

      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
          REDIS_HOST: localhost
          REDIS_PORT: 6379

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Start services
        run: docker-compose up -d

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Stop services
        run: docker-compose down
```

### 8.2 Rodar Localmente

```bash
# Unit tests
npm run test

# Integration tests (requer DB + Redis)
docker-compose up -d postgres redis
npm run test:integration

# E2E tests (requer todo o stack)
docker-compose up -d
npm run test:e2e
docker-compose down

# Todos os testes com cobertura
npm run test:cov
```

---

## 📝 Checklist de Testes para PR

Antes de abrir PR, verificar:

- [ ] Testes unitários para todos os serviços novos/modificados
- [ ] Testes de integração para endpoints de API
- [ ] Testes de integração para workers/processors
- [ ] Cobertura >= 70% (verificar com `npm run test:cov`)
- [ ] Todos os testes passando localmente
- [ ] Testes passando no CI
- [ ] Edge cases cobertos (validações, erros, etc.)
- [ ] Mocks corretos para dependências externas
- [ ] Fixtures de dados criados quando necessário

---

## 📚 Referências

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [Supertest](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

**Última atualização:** 2025-10-20
**Versão:** 1.0
**Mantido por:** Time de Arquitetura
