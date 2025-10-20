import { ConfigService } from '@nestjs/config';

// Mocks de BullMQ e ioredis antes de importar o SUT
const mockCounts = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
class MockQueue {
  add = jest.fn(async (_name: string, _data: any, opts: any) => ({ id: opts.jobId }));
  getWaitingCount = jest.fn(async () => mockCounts.waiting);
  getActiveCount = jest.fn(async () => mockCounts.active);
  getCompletedCount = jest.fn(async () => mockCounts.completed);
  getFailedCount = jest.fn(async () => mockCounts.failed);
  getDelayedCount = jest.fn(async () => mockCounts.delayed);
  close = jest.fn(async () => void 0);
}

jest.mock('bullmq', () => ({ Queue: MockQueue }));
jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({ quit: jest.fn(async () => void 0) })));

import { QueueService } from '../../queue/queue.service';

describe('QueueService', () => {
  let service: QueueService;

  beforeAll(async () => {
    const config = new ConfigService({
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      REDIS_DB: 0,
    } as any);
    service = new QueueService(config);
    await service.onModuleInit();
  });

  afterAll(async () => {
    await service.onModuleDestroy();
  });

  it('should enqueue a job and return job id', async () => {
    // Arrange
    const now = new Date().toISOString();
    const jobData: any = {
      outboxId: '00000000-0000-0000-0000-000000000001',
      companyId: '00000000-0000-0000-0000-000000000002',
      requestId: 'req_test',
      to: 'test@example.com',
      cc: [],
      bcc: [],
      subject: 'Test',
      htmlRef: '00000000-0000-0000-0000-000000000001',
      recipient: {
        email: 'test@example.com',
        externalId: 'ext-1',
      },
      attempt: 1,
      enqueuedAt: now,
    };

    // Act
    const jobId = await service.enqueueEmailJob(jobData);

    // Assert
    expect(jobId).toBe(jobData.outboxId);
  });

  it('should return queue health', async () => {
    const health = await service.getQueueHealth();
    expect(health).toHaveProperty('waiting');
    expect(health).toHaveProperty('active');
  });
});


