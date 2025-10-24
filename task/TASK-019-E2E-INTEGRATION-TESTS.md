# TASK-019 — Testes E2E de Integração Completa (Testes - Priority 1)

## Contexto
- Origem: Análise de arquitetura - Sistema 75% completo
- Resumo: Faltam testes E2E validando fluxo completo: API → Redis → Worker → SES. Testes unitários validam partes isoladas, mas não garantem integração funciona corretamente.

## O que precisa ser feito
- [ ] Criar `apps/api/test/email-flow.e2e-spec.ts`
- [ ] Configurar TestContainers (Redis + Postgres)
- [ ] Testar fluxo completo: POST /v1/email/send → Queue → Worker → Mock SES
- [ ] Validar transições de status (PENDING → ENQUEUED → RECEIVED → SENT)
- [ ] Testar retry flow (simular falha de SES)
- [ ] Testar DLQ após 3 tentativas
- [ ] Testar idempotency (enviar mesmo email 2x)
- [ ] Testar rate limiting
- [ ] Testar circuit breaker (múltiplas falhas consecutivas)
- [ ] Adicionar smoke tests para CI/CD

## Urgência
- **Nível (1–5):** 5 (CRÍTICO - Production Blocker)

## Responsável sugerido
- Backend + QA + DevOps

## Dependências / Riscos
- Dependências:
  - TestContainers (Redis + Postgres)
  - AWS SDK mock (aws-sdk-client-mock)
  - BullMQ
  - Supertest
- Riscos:
  - CRÍTICO: Sem E2E, integrações podem quebrar silenciosamente
  - Testes E2E lentos (30-60s) - podem atrasar CI/CD
  - Requer Docker local e em CI

## Detalhes Técnicos

### 1. Configurar TestContainers

**Arquivo:** `apps/api/test/setup-e2e.ts`

```typescript
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Client } from 'pg';

export interface E2ETestEnvironment {
  redisContainer: StartedTestContainer;
  postgresContainer: StartedTestContainer;
  databaseUrl: string;
  redisUrl: string;
}

export async function setupE2EEnvironment(): Promise<E2ETestEnvironment> {
  // Start Redis container
  const redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();

  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

  // Start Postgres container
  const postgresContainer = await new GenericContainer('postgres:15-alpine')
    .withExposedPorts(5432)
    .withEnvironment({
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'email_gateway_test',
    })
    .start();

  const databaseUrl = `postgresql://test:test@${postgresContainer.getHost()}:${postgresContainer.getMappedPort(5432)}/email_gateway_test`;

  // Run migrations
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  // Execute migrations using Prisma
  await client.end();

  return {
    redisContainer,
    postgresContainer,
    databaseUrl,
    redisUrl,
  };
}

export async function teardownE2EEnvironment(env: E2ETestEnvironment) {
  await env.redisContainer?.stop();
  await env.postgresContainer?.stop();
}
```

### 2. Criar teste E2E completo

**Arquivo:** `apps/api/test/email-flow.e2e-spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Worker } from 'bullmq';
import { mockClient } from 'aws-sdk-client-mock';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  setupE2EEnvironment,
  teardownE2EEnvironment,
  E2ETestEnvironment,
} from './setup-e2e';
import { prisma } from '@email-gateway/database';

describe('Email Flow (E2E - Full Integration)', () => {
  let app: INestApplication;
  let env: E2ETestEnvironment;
  let worker: Worker;
  let apiKey: string;
  let companyId: string;
  const sesMock = mockClient(SESClient);

  beforeAll(async (done) => {
    // Setup TestContainers
    env = await setupE2EEnvironment();

    // Configure environment variables
    process.env.DATABASE_URL = env.databaseUrl;
    process.env.REDIS_URL = env.redisUrl;
    process.env.AWS_REGION = 'us-east-1';
    process.env.ENCRYPTION_KEY = 'test-key-32-characters-long!!!!!';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
    );

    await app.init();

    // Setup test company
    const testCompany = await prisma.company.create({
      data: {
        name: 'E2E Test Company',
        apiKey: 'e2e_test_key_12345678901234567890',
        apiKeyHash: 'e2e_hash',
        apiKeyPrefix: 'e2e_test',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });

    companyId = testCompany.id;
    apiKey = testCompany.apiKey;

    // Mock AWS SES
    sesMock.on(SendEmailCommand).resolves({
      MessageId: 'mock-ses-message-id-123',
    });

    // Start worker to process jobs
    worker = new Worker(
      'email-queue',
      async (job) => {
        // Worker logic here (import from worker app)
        console.log('Processing job:', job.id);
      },
      {
        connection: {
          host: env.redisContainer.getHost(),
          port: env.redisContainer.getMappedPort(6379),
        },
      }
    );

    done();
  }, 60000); // 60s timeout for container startup

  afterAll(async () => {
    await worker?.close();
    await app?.close();
    await prisma?.$disconnect();
    await teardownE2EEnvironment(env);
  });

  beforeEach(async () => {
    // Clear test data
    await prisma.emailOutbox.deleteMany({ where: { companyId } });
    await prisma.recipient.deleteMany({ where: { companyId } });
    sesMock.reset();
  });

  describe('Complete email flow: API → Queue → Worker → SES', () => {
    it('should process email end-to-end successfully', async () => {
      const emailPayload = {
        to: 'e2e-test@example.com',
        subject: 'E2E Test Email',
        html: '<p>Testing complete flow</p>',
        recipient: {
          email: 'e2e-test@example.com',
          nome: 'E2E Test User',
        },
      };

      // Step 1: Send email via API
      const sendResponse = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send(emailPayload)
        .expect(201);

      expect(sendResponse.body.outboxId).toBeDefined();
      expect(sendResponse.body.status).toBe('ENQUEUED');

      const outboxId = sendResponse.body.outboxId;

      // Step 2: Verify email in database with ENQUEUED status
      let emailOutbox = await prisma.emailOutbox.findUnique({
        where: { id: outboxId },
      });

      expect(emailOutbox).toBeDefined();
      expect(emailOutbox.status).toBe('ENQUEUED');
      expect(emailOutbox.jobId).toBeDefined();

      // Step 3: Wait for worker to process job (max 10s)
      await new Promise((resolve) => setTimeout(resolve, 10000));

      // Step 4: Verify email status changed to SENT
      emailOutbox = await prisma.emailOutbox.findUnique({
        where: { id: outboxId },
      });

      expect(emailOutbox.status).toBe('SENT');
      expect(emailOutbox.processedAt).toBeDefined();

      // Step 5: Verify EmailLog created
      const emailLog = await prisma.emailLog.findUnique({
        where: { outboxId },
      });

      expect(emailLog).toBeDefined();
      expect(emailLog.status).toBe('SENT');
      expect(emailLog.sesMessageId).toBe('mock-ses-message-id-123');

      // Step 6: Verify SES was called
      expect(sesMock.calls()).toHaveLength(1);
      const sesCall = sesMock.call(0);
      expect(sesCall.args[0].input).toMatchObject({
        Destination: { ToAddresses: ['e2e-test@example.com'] },
        Message: {
          Subject: { Data: 'E2E Test Email' },
        },
      });
    }, 30000); // 30s timeout

    it('should handle retry on SES failure', async () => {
      // Mock SES to fail first 2 attempts, succeed on 3rd
      let attempts = 0;
      sesMock.on(SendEmailCommand).callsFake(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('SES rate limit exceeded');
        }
        return { MessageId: 'success-after-retry-123' };
      });

      const emailPayload = {
        to: 'retry-test@example.com',
        subject: 'Retry Test',
        html: '<p>Testing retry</p>',
      };

      const sendResponse = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send(emailPayload)
        .expect(201);

      const outboxId = sendResponse.body.outboxId;

      // Wait for retries (5s + 10s = 15s + processing time)
      await new Promise((resolve) => setTimeout(resolve, 20000));

      // Verify eventually succeeded
      const emailOutbox = await prisma.emailOutbox.findUnique({
        where: { id: outboxId },
      });

      expect(emailOutbox.status).toBe('SENT');
      expect(emailOutbox.attempts).toBe(3);

      const emailLog = await prisma.emailLog.findUnique({
        where: { outboxId },
      });

      expect(emailLog.attempts).toBe(3);
      expect(emailLog.sesMessageId).toBe('success-after-retry-123');
    }, 40000);

    it('should move to DLQ after 3 failed attempts', async () => {
      // Mock SES to always fail
      sesMock.on(SendEmailCommand).rejects(new Error('Permanent SES error'));

      const emailPayload = {
        to: 'dlq-test@example.com',
        subject: 'DLQ Test',
        html: '<p>Testing DLQ</p>',
      };

      const sendResponse = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send(emailPayload)
        .expect(201);

      const outboxId = sendResponse.body.outboxId;

      // Wait for all 3 attempts
      await new Promise((resolve) => setTimeout(resolve, 30000));

      // Verify status is FAILED
      const emailOutbox = await prisma.emailOutbox.findUnique({
        where: { id: outboxId },
      });

      expect(emailOutbox.status).toBe('FAILED');
      expect(emailOutbox.attempts).toBe(3);
      expect(emailOutbox.lastError).toContain('Permanent SES error');

      const emailLog = await prisma.emailLog.findUnique({
        where: { outboxId },
      });

      expect(emailLog.status).toBe('FAILED');
    }, 40000);
  });

  describe('Idempotency', () => {
    it('should not create duplicate emails with same idempotency key', async () => {
      const emailPayload = {
        to: 'idempotency-test@example.com',
        subject: 'Idempotency Test',
        html: '<p>Testing idempotency</p>',
        idempotencyKey: 'unique-key-12345',
      };

      // Send same request twice
      const response1 = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send(emailPayload)
        .expect(201);

      const response2 = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send(emailPayload)
        .expect(409); // Conflict

      expect(response2.body.message).toContain('duplicate');
      expect(response2.body.outboxId).toBe(response1.body.outboxId);

      // Verify only one email in database
      const emails = await prisma.emailOutbox.findMany({
        where: { companyId, to: 'idempotency-test@example.com' },
      });

      expect(emails).toHaveLength(1);
    });
  });

  describe('Circuit breaker', () => {
    it('should open circuit after multiple consecutive failures', async () => {
      // Mock SES to always fail
      sesMock.on(SendEmailCommand).rejects(new Error('SES timeout'));

      // Send 10 emails rapidly
      const promises = Array.from({ length: 10 }, (_, i) =>
        request(app.getHttpServer())
          .post('/v1/email/send')
          .set('x-api-key', apiKey)
          .send({
            to: `circuit-test-${i}@example.com`,
            subject: 'Circuit Test',
            html: '<p>Test</p>',
          })
      );

      await Promise.all(promises);

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 15000));

      // Circuit breaker should be open (subsequent requests fail fast)
      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'circuit-final@example.com',
          subject: 'Circuit Test',
          html: '<p>Test</p>',
        })
        .expect(503); // Service Unavailable

      expect(response.body.message).toContain('circuit breaker');
    }, 30000);
  });
});
```

### 3. Configurar Jest para E2E

**Arquivo:** `apps/api/test/jest-e2e.json`

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "testTimeout": 60000,
  "maxWorkers": 1,
  "forceExit": true
}
```

### 4. Adicionar dependências

```json
{
  "devDependencies": {
    "testcontainers": "^10.0.0",
    "@testcontainers/redis": "^10.0.0",
    "aws-sdk-client-mock": "^4.0.0",
    "pg": "^8.11.0"
  }
}
```

### 5. Scripts para rodar testes

```bash
# Rodar todos os testes E2E (requer Docker)
npm run test:e2e

# Rodar teste específico
npm run test:e2e email-flow.e2e-spec.ts

# CI/CD smoke tests (subset de testes rápidos)
npm run test:e2e:smoke
```

## Categoria
**Testes - End-to-End + Integração**

## Bloqueador para Produção?
**SIM - CRÍTICO**

Sem testes E2E:
- ❌ Integrações entre API, Queue e Worker não validadas
- ❌ Impossível garantir fluxo completo funciona
- ❌ Alterações podem quebrar sistema silenciosamente
- ❌ Difícil detectar problemas de integração antes de produção

**Prioridade Máxima:** Implementar antes de deploy em produção.
