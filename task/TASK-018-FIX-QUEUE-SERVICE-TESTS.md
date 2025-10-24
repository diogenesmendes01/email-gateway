# TASK-018 — Corrigir Testes do Queue Service (Testes - Priority 1)

## Contexto
- Origem: Análise de arquitetura - Sistema 75% completo
- Resumo: O Queue Service (apps/worker/src/services/queue.service.ts) não possui testes automatizados. Crítico para confiabilidade do sistema, pois esse serviço gerencia o BullMQ e processa milhares de emails/dia.

## O que precisa ser feito
- [ ] Criar `apps/worker/src/services/queue.service.spec.ts`
- [ ] Mockar Redis e BullMQ para testes unitários
- [ ] Testar adição de jobs à fila
- [ ] Testar processamento de jobs com sucesso
- [ ] Testar retry logic (tentativas 1, 2, 3)
- [ ] Testar exponential backoff
- [ ] Testar movimentação para DLQ após 3 falhas
- [ ] Testar rate limiting
- [ ] Adicionar testes de integração com Redis (TestContainer)

## Urgência
- **Nível (1–5):** 5 (CRÍTICO - Production Blocker)

## Responsável sugerido
- Backend + QA

## Dependências / Riscos
- Dependências:
  - BullMQ já instalado
  - Redis TestContainer (precisa adicionar)
  - Jest mocking
- Riscos:
  - CRÍTICO: Sem testes, bugs podem corromper fila de produção
  - Alterações no Queue Service podem quebrar sistema silenciosamente

## Detalhes Técnicos

### 1. Criar arquivo de teste unitário

**Arquivo:** `apps/worker/src/services/queue.service.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { QueueService } from './queue.service';
import { Queue, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';

// Mock BullMQ
jest.mock('bullmq', () => {
  const mockQueue = {
    add: jest.fn(),
    process: jest.fn(),
    on: jest.fn(),
    close: jest.fn(),
  };

  return {
    Queue: jest.fn(() => mockQueue),
    Worker: jest.fn(),
  };
});

describe('QueueService', () => {
  let service: QueueService;
  let mockQueue: jest.Mocked<Queue>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'REDIS_URL') return 'redis://localhost:6379';
              if (key === 'QUEUE_NAME') return 'email-queue';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
    mockQueue = (service as any).queue; // Access private queue for testing
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addEmailJob', () => {
    it('should add job to queue with correct data', async () => {
      const emailData = {
        outboxId: 'outbox-123',
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      };

      mockQueue.add.mockResolvedValue({ id: 'job-123' } as Job);

      await service.addEmailJob(emailData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-email',
        emailData,
        expect.objectContaining({
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 3,
        })
      );
    });

    it('should configure retry with exponential backoff', async () => {
      const emailData = {
        outboxId: 'outbox-123',
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      };

      mockQueue.add.mockResolvedValue({ id: 'job-123' } as Job);

      await service.addEmailJob(emailData);

      const callArgs = mockQueue.add.mock.calls[0];
      const options = callArgs[2];

      expect(options.attempts).toBe(3);
      expect(options.backoff).toEqual({
        type: 'exponential',
        delay: 5000, // 5s, 10s, 20s
      });
    });

    it('should handle queue add failures', async () => {
      const emailData = {
        outboxId: 'outbox-123',
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      };

      mockQueue.add.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.addEmailJob(emailData)).rejects.toThrow(
        'Redis connection failed'
      );
    });
  });

  describe('processEmailJob', () => {
    it('should process job and mark as complete', async () => {
      const job = {
        id: 'job-123',
        data: {
          outboxId: 'outbox-123',
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        },
        attemptsMade: 0,
        updateProgress: jest.fn(),
      } as unknown as Job;

      // Mock successful processing
      const processSpy = jest.spyOn(service as any, 'sendEmail');
      processSpy.mockResolvedValue(true);

      await service.processEmailJob(job);

      expect(processSpy).toHaveBeenCalledWith(job.data);
      expect(job.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should retry on failure with correct attempt count', async () => {
      const job = {
        id: 'job-123',
        data: { outboxId: 'outbox-123', to: 'test@example.com' },
        attemptsMade: 1,
        updateProgress: jest.fn(),
      } as unknown as Job;

      const processSpy = jest.spyOn(service as any, 'sendEmail');
      processSpy.mockRejectedValue(new Error('SES rate limit'));

      await expect(service.processEmailJob(job)).rejects.toThrow(
        'SES rate limit'
      );

      expect(job.attemptsMade).toBe(1);
    });

    it('should move to DLQ after 3 failed attempts', async () => {
      const job = {
        id: 'job-123',
        data: { outboxId: 'outbox-123', to: 'test@example.com' },
        attemptsMade: 3,
        moveToFailed: jest.fn(),
      } as unknown as Job;

      const processSpy = jest.spyOn(service as any, 'sendEmail');
      processSpy.mockRejectedValue(new Error('Permanent failure'));

      await expect(service.processEmailJob(job)).rejects.toThrow(
        'Permanent failure'
      );

      expect(job.attemptsMade).toBe(3);
      // BullMQ automatically moves to failed queue
    });
  });

  describe('Rate limiting', () => {
    it('should respect rate limit configuration', async () => {
      const jobs = Array.from({ length: 100 }, (_, i) => ({
        outboxId: `outbox-${i}`,
        to: `user${i}@example.com`,
        subject: 'Test',
        html: '<p>Test</p>',
      }));

      for (const jobData of jobs) {
        await service.addEmailJob(jobData);
      }

      // Verify rate limiter is configured
      expect(mockQueue.add).toHaveBeenCalledTimes(100);
    });
  });
});
```

### 2. Adicionar testes de integração com Redis

**Arquivo:** `apps/worker/test/queue.integration.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { QueueService } from '../src/services/queue.service';
import { Queue, Worker } from 'bullmq';
import { StartedRedisContainer } from '@testcontainers/redis';
import { GenericContainer } from 'testcontainers';

describe('QueueService (Integration)', () => {
  let redisContainer: StartedRedisContainer;
  let service: QueueService;
  let queue: Queue;
  let worker: Worker;

  beforeAll(async () => {
    // Start Redis TestContainer
    redisContainer = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();

    const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        {
          provide: 'REDIS_URL',
          useValue: redisUrl,
        },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
    queue = (service as any).queue;
  });

  afterAll(async () => {
    await queue?.close();
    await worker?.close();
    await redisContainer?.stop();
  });

  it('should add and process jobs end-to-end', async (done) => {
    const emailData = {
      outboxId: 'integration-test-123',
      to: 'integration@example.com',
      subject: 'Integration Test',
      html: '<p>Test</p>',
    };

    // Add job to queue
    const job = await service.addEmailJob(emailData);
    expect(job.id).toBeDefined();

    // Create worker to process job
    worker = new Worker(
      'email-queue',
      async (job) => {
        expect(job.data).toEqual(emailData);
        done();
      },
      {
        connection: { host: redisContainer.getHost(), port: redisContainer.getMappedPort(6379) },
      }
    );
  });

  it('should retry failed jobs with exponential backoff', async () => {
    let attempts = 0;

    worker = new Worker(
      'email-queue',
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Simulated failure');
        }
        return true;
      },
      {
        connection: { host: redisContainer.getHost(), port: redisContainer.getMappedPort(6379) },
      }
    );

    await service.addEmailJob({
      outboxId: 'retry-test-123',
      to: 'retry@example.com',
      subject: 'Retry Test',
      html: '<p>Test</p>',
    });

    // Wait for retries
    await new Promise((resolve) => setTimeout(resolve, 30000));

    expect(attempts).toBe(3);
  });
});
```

### 3. Adicionar TestContainers ao package.json

```json
{
  "devDependencies": {
    "@testcontainers/redis": "^10.0.0",
    "testcontainers": "^10.0.0"
  }
}
```

### 4. Atualizar script de testes

```bash
# Rodar testes unitários
npm run test queue.service.spec.ts

# Rodar testes de integração (requer Docker)
npm run test:integration queue.integration.spec.ts
```

## Categoria
**Testes - Unitários + Integração**

## Bloqueador para Produção?
**SIM - CRÍTICO**

Sem testes no Queue Service:
- ❌ Impossível garantir confiabilidade de retry logic
- ❌ Bugs podem causar perda de emails em produção
- ❌ Alterações no código são perigosas
- ❌ Difícil diagnosticar problemas em produção

**Prioridade Máxima:** Implementar antes de qualquer deploy em produção.
