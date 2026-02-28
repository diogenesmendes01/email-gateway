/**
 * TASK-018: Queue Service Unit Tests
 * Expanded from existing tests to provide comprehensive coverage
 */

// Mocks de BullMQ e ioredis antes de importar o SUT
const mockCounts = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, prioritized: 0 };
class MockQueue {
  add = jest.fn(async (_name: string, _data: any, opts: any) => ({ id: opts.jobId }));
  getWaitingCount = jest.fn(async () => mockCounts.waiting);
  getActiveCount = jest.fn(async () => mockCounts.active);
  getCompletedCount = jest.fn(async () => mockCounts.completed);
  getFailedCount = jest.fn(async () => mockCounts.failed);
  getDelayedCount = jest.fn(async () => mockCounts.delayed);
  getPrioritizedCount = jest.fn(async () => mockCounts.prioritized);
  getJob = jest.fn();
  pause = jest.fn(async () => void 0);
  resume = jest.fn(async () => void 0);
  close = jest.fn(async () => void 0);
}

const mockRedis = {
  once: jest.fn((event: string, callback: any) => {
    if (event === 'ready') {
      setTimeout(() => callback(), 0);
    }
  }),
  quit: jest.fn(async () => void 0),
};

jest.mock('bullmq', () => ({ Queue: MockQueue }));
jest.mock('ioredis', () => jest.fn().mockImplementation(() => mockRedis));

import { QueueService } from '../../queue/queue.service';

describe('QueueService', () => {
  let service: QueueService;
  let mockQueue: MockQueue;
  const originalEnv = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset mock counts
    mockCounts.waiting = 0;
    mockCounts.active = 0;
    mockCounts.completed = 0;
    mockCounts.failed = 0;
    mockCounts.delayed = 0;
    mockCounts.prioritized = 0;

    // Set environment variables for tests
    process.env = {
      ...originalEnv,
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      REDIS_DB: '0',
    };

    service = new QueueService();
    await service.onModuleInit();

    // Get mock queue instance
    mockQueue = (service as any).queue;
  });

  afterEach(async () => {
    await (service as any).onModuleDestroy();
    process.env = originalEnv;
  });

  describe('enqueueEmailJob', () => {
    it('should enqueue a job and return job id', async () => {
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

      const jobId = await (service as any).enqueueEmailJob(jobData);

      expect(jobId).toBe(jobData.outboxId);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-email',
        jobData,
        expect.objectContaining({
          jobId: jobData.outboxId,
        })
      );
    });

    it('should use outboxId as jobId for idempotency', async () => {
      const jobData: any = {
        outboxId: 'outbox-456',
        companyId: 'company-123',
        to: 'test@example.com',
        subject: 'Test',
      };

      await (service as any).enqueueEmailJob(jobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-email',
        jobData,
        expect.objectContaining({
          jobId: 'outbox-456',
        })
      );
    });

    it('should throw error if queue add fails', async () => {
      const jobData: any = {
        outboxId: 'outbox-error',
        companyId: 'company-123',
        to: 'test@example.com',
        subject: 'Test',
      };

      mockQueue.add = jest.fn().mockRejectedValue(new Error('Redis connection lost'));

      await expect((service as any).enqueueEmailJob(jobData)).rejects.toThrow('Redis connection lost');
    });
  });

  describe('getQueueHealth', () => {
    it('should return queue health metrics', async () => {
      mockCounts.waiting = 5;
      mockCounts.active = 5;
      mockCounts.completed = 100;
      mockCounts.failed = 2;
      mockCounts.delayed = 3;
      mockCounts.prioritized = 5;

      const health = await (service as any).getQueueHealth();

      expect(health).toEqual({
        waiting: 10, // waiting (5) + prioritized (5)
        active: 5,
        completed: 100,
        failed: 2,
        delayed: 3,
        total: 18, // waiting (5) + active (5) + delayed (3) + prioritized (5)
      });
    });

    it('should have required properties', async () => {
      const health = await (service as any).getQueueHealth();

      expect(health).toHaveProperty('waiting');
      expect(health).toHaveProperty('active');
      expect(health).toHaveProperty('completed');
      expect(health).toHaveProperty('failed');
      expect(health).toHaveProperty('delayed');
      expect(health).toHaveProperty('total');
    });
  });

  describe('isHealthy', () => {
    it('should return true when queue is healthy', async () => {
      mockCounts.waiting = 100;
      mockCounts.active = 10;
      mockCounts.failed = 5;
      mockCounts.delayed = 0;
      mockCounts.completed = 500;

      const isHealthy = await (service as any).isHealthy();

      expect(isHealthy).toBe(true);
    });

    it('should return false when too many waiting jobs', async () => {
      mockCounts.waiting = 1500; // > 1000
      mockCounts.active = 10;
      mockCounts.failed = 5;
      mockCounts.delayed = 0;
      mockCounts.completed = 500;

      const isHealthy = await (service as any).isHealthy();

      expect(isHealthy).toBe(false);
    });

    it('should return false when too many failed jobs', async () => {
      mockCounts.waiting = 100;
      mockCounts.active = 10;
      mockCounts.failed = 60; // > 50
      mockCounts.delayed = 0;
      mockCounts.completed = 500;

      const isHealthy = await (service as any).isHealthy();

      expect(isHealthy).toBe(false);
    });
  });

  describe('getJob', () => {
    it('should retrieve specific job by ID', async () => {
      const mockJob = { id: 'job-123', data: {} };
      mockQueue.getJob = jest.fn().mockResolvedValue(mockJob);

      const job = await (service as any).getJob('job-123');

      expect(mockQueue.getJob).toHaveBeenCalledWith('job-123');
      expect(job).toEqual(mockJob);
    });
  });

  describe('pause and resume', () => {
    it('should pause queue', async () => {
      await (service as any).pause();

      expect(mockQueue.pause).toHaveBeenCalled();
    });

    it('should resume queue', async () => {
      await (service as any).resume();

      expect(mockQueue.resume).toHaveBeenCalled();
    });
  });

  describe('lifecycle hooks', () => {
    it('should close queue and disconnect Redis on module destroy', async () => {
      await (service as any).onModuleDestroy();

      expect(mockQueue.close).toHaveBeenCalled();
      expect(mockRedis.quit).toHaveBeenCalled();
    });
  });
});


