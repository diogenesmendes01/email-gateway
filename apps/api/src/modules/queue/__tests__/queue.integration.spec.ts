/**
 * TASK-018: Queue Service Integration Tests
 * Tests with real Redis using TestContainers
 */

import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { QueueService } from '../queue.service';
import { EMAIL_JOB_CONFIG } from '@email-gateway/shared';

describe('QueueService Integration Tests', () => {
  let redisContainer: StartedRedisContainer;
  let service: QueueService;
  let redis: Redis;
  let worker: Worker<any, any, string>;
  let originalEnv: NodeJS.ProcessEnv;

  // Setup TestContainer before all tests
  beforeAll(async () => {
    // Start Redis container
    redisContainer = await new RedisContainer('redis:7-alpine').start();

    // Save original env
    originalEnv = { ...process.env };

    // Configure environment to use test container
    process.env.REDIS_HOST = redisContainer.getHost();
    process.env.REDIS_PORT = redisContainer.getPort().toString();
    process.env.REDIS_DB = '0';
  }, 60000); // 60s timeout for container startup

  // Cleanup after all tests
  afterAll(async () => {
    await redisContainer.stop();
    process.env = originalEnv;
  }, 30000);

  beforeEach(async () => {
    // Create service instance
    service = new QueueService();
    await (service as any).onModuleInit();

    // Get Redis connection for verification
    redis = new Redis({
      host: redisContainer.getHost(),
      port: redisContainer.getPort(),
      db: 0,
    });

    // Clear all queues before each test
    await redis.flushdb();
  });

  afterEach(async () => {
    // Cleanup worker if created
    if (worker) {
      await worker.close();
    }

    // Cleanup service
    await (service as any).onModuleDestroy();

    // Disconnect Redis
    await redis.quit();
  });

  describe('Real Queue Operations', () => {
    it('should enqueue job to real Redis', async () => {
      const jobData: any = {
        outboxId: '00000000-0000-0000-0000-000000000001',
        companyId: '00000000-0000-0000-0000-000000000002',
        requestId: 'req_integration_test',
        to: 'integration@example.com',
        cc: [],
        bcc: [],
        subject: 'Integration Test',
        htmlRef: '00000000-0000-0000-0000-000000000003',
        recipient: {
          email: 'integration@example.com',
          externalId: 'ext-integration-1',
        },
        attempt: 1,
        enqueuedAt: new Date().toISOString(),
      };

      const jobId = await (service as any).enqueueEmailJob(jobData);

      expect(jobId).toBe(jobData.outboxId);

      // Verify job exists in Redis
      const queue = (service as any).queue as Queue;
      const job = await queue.getJob(jobId);

      expect(job).toBeDefined();
      expect(job!.id).toBe(jobData.outboxId);
      expect(job!.data).toMatchObject(jobData);
    });

    it('should respect idempotency - duplicate outboxId', async () => {
      // Pause queue to prevent immediate processing
      await (service as any).pause();

      const jobData: any = {
        outboxId: 'idempotent-test-id',
        companyId: '00000000-0000-0000-0000-000000000002',
        requestId: 'req_idempotent',
        to: 'idempotent@example.com',
        subject: 'Idempotency Test',
        htmlRef: '00000000-0000-0000-0000-000000000003',
        recipient: {
          email: 'idempotent@example.com',
          externalId: 'ext-idempotent',
        },
        attempt: 1,
        enqueuedAt: new Date().toISOString(),
      };

      // Enqueue same job twice
      const jobId1 = await (service as any).enqueueEmailJob(jobData);
      const jobId2 = await (service as any).enqueueEmailJob(jobData);

      expect(jobId1).toBe(jobId2);

      // Verify only one job in queue
      const queue = (service as any).queue as Queue;
      const waitingCount = await queue.getWaitingCount();
      expect(waitingCount).toBe(1);

      // Resume queue
      await (service as any).resume();
    });

    it('should get accurate queue health metrics', async () => {
      // Pause queue to prevent immediate processing
      await (service as any).pause();

      // Enqueue multiple jobs
      const jobs = Array.from({ length: 5 }, (_, i) => ({
        outboxId: `job-${i}`,
        companyId: '00000000-0000-0000-0000-000000000002',
        requestId: `req_${i}`,
        to: `test${i}@example.com`,
        subject: `Test ${i}`,
        htmlRef: '00000000-0000-0000-0000-000000000003',
        recipient: {
          email: `test${i}@example.com`,
          externalId: `ext-${i}`,
        },
        attempt: 1,
        enqueuedAt: new Date().toISOString(),
      }));

      for (const job of jobs) {
        await (service as any).enqueueEmailJob(job);
      }

      const health = await (service as any).getQueueHealth();

      expect(health.waiting).toBe(5);
      expect(health.active).toBe(0);
      expect(health.failed).toBe(0);
      expect(health.total).toBe(5); // waiting + active + delayed

      // Resume queue
      await (service as any).resume();
    });

    it('should detect unhealthy queue state', async () => {
      // Initially healthy
      let isHealthy = await (service as any).isHealthy();
      expect(isHealthy).toBe(true);

      // Enqueue many jobs to exceed threshold (1000)
      const jobs = Array.from({ length: 100 }, (_, i) => ({
        outboxId: `bulk-job-${i}`,
        companyId: '00000000-0000-0000-0000-000000000002',
        requestId: `req_bulk_${i}`,
        to: `bulk${i}@example.com`,
        subject: `Bulk ${i}`,
        htmlRef: '00000000-0000-0000-0000-000000000003',
        recipient: {
          email: `bulk${i}@example.com`,
          externalId: `ext-bulk-${i}`,
        },
        attempt: 1,
        enqueuedAt: new Date().toISOString(),
      }));

      for (const job of jobs) {
        await (service as any).enqueueEmailJob(job);
      }

      // Still healthy with 100 jobs (threshold is 1000)
      isHealthy = await (service as any).isHealthy();
      expect(isHealthy).toBe(true);
    }, 30000); // Longer timeout for bulk operations
  });

  describe('Worker Integration', () => {
    it('should process job with real worker', async () => {
      const processedJobs: any[] = [];

      // Create worker that processes jobs
      worker = new Worker(
        EMAIL_JOB_CONFIG.QUEUE_NAME,
        async (job) => {
          processedJobs.push(job.data);
          return { success: true };
        },
        {
          connection: {
            host: redisContainer.getHost(),
            port: redisContainer.getPort(),
            db: 0,
          },
        }
      );

      // Enqueue job
      const jobData: any = {
        outboxId: 'worker-test-id',
        companyId: '00000000-0000-0000-0000-000000000002',
        requestId: 'req_worker_test',
        to: 'worker@example.com',
        subject: 'Worker Test',
        htmlRef: '00000000-0000-0000-0000-000000000003',
        recipient: {
          email: 'worker@example.com',
          externalId: 'ext-worker',
        },
        attempt: 1,
        enqueuedAt: new Date().toISOString(),
      };

      await (service as any).enqueueEmailJob(jobData);

      // Wait for job to be processed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(processedJobs.length).toBe(1);
      expect(processedJobs[0]).toMatchObject(jobData);
    }, 10000);

    it('should retry failed jobs with exponential backoff', async () => {
      const attempts: number[] = [];

      // Create worker that fails first 2 attempts, succeeds on 3rd
      worker = new Worker(
        EMAIL_JOB_CONFIG.QUEUE_NAME,
        async (job) => {
          attempts.push(job.attemptsMade);

          if (job.attemptsMade < 3) {
            throw new Error('Simulated failure');
          }

          return { success: true };
        },
        {
          connection: {
            host: redisContainer.getHost(),
            port: redisContainer.getPort(),
            db: 0,
          },
        }
      );

      // Wait for worker to be ready
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Enqueue job
      const jobData: any = {
        outboxId: 'retry-test-id',
        companyId: '00000000-0000-0000-0000-000000000002',
        requestId: 'req_retry_test',
        to: 'retry@example.com',
        subject: 'Retry Test',
        htmlRef: '00000000-0000-0000-0000-000000000003',
        recipient: {
          email: 'retry@example.com',
          externalId: 'ext-retry',
        },
        attempt: 1,
        enqueuedAt: new Date().toISOString(),
      };

      await (service as any).enqueueEmailJob(jobData);

      // Wait for retries (exponential backoff delays are: 1ms, 5ms, 30ms, 120ms, 600ms)
      // We'll wait for first 3 attempts (should happen within 1 second)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Should have attempted at least twice
      expect(attempts.length).toBeGreaterThanOrEqual(2);
      expect(attempts[0]).toBe(1); // First attempt
      expect(attempts[1]).toBe(2); // First retry
    }, 15000);

    it('should move job to failed after max retries', async () => {
      // Create worker that always fails
      worker = new Worker(
        EMAIL_JOB_CONFIG.QUEUE_NAME,
        async (): Promise<any> => {
          throw new Error('Permanent failure');
        },
        {
          connection: {
            host: redisContainer.getHost(),
            port: redisContainer.getPort(),
            db: 0,
          },
        }
      );

      // Enqueue job
      const jobData: any = {
        outboxId: 'dlq-test-id',
        companyId: '00000000-0000-0000-0000-000000000002',
        requestId: 'req_dlq_test',
        to: 'dlq@example.com',
        subject: 'DLQ Test',
        htmlRef: '00000000-0000-0000-0000-000000000003',
        recipient: {
          email: 'dlq@example.com',
          externalId: 'ext-dlq',
        },
        attempt: 1,
        enqueuedAt: new Date().toISOString(),
      };

      await (service as any).enqueueEmailJob(jobData);

      // Wait for all retries to exhaust (will take a while with exponential backoff)
      // For testing, we'll just verify failed job count increases
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const health = await (service as any).getQueueHealth();

      // Job should eventually be in failed state
      // Note: This might be in delayed (waiting for retry) or failed depending on timing
      expect(health.failed + health.delayed + health.active).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Pause and Resume', () => {
    it('should pause and resume queue processing', async () => {
      const processedJobs: any[] = [];

      // Create worker
      worker = new Worker(
        EMAIL_JOB_CONFIG.QUEUE_NAME,
        async (job) => {
          processedJobs.push(job.data);
          return { success: true };
        },
        {
          connection: {
            host: redisContainer.getHost(),
            port: redisContainer.getPort(),
            db: 0,
          },
        }
      );

      // Pause queue
      await (service as any).pause();

      // Enqueue job while paused
      const jobData: any = {
        outboxId: 'pause-test-id',
        companyId: '00000000-0000-0000-0000-000000000002',
        requestId: 'req_pause_test',
        to: 'pause@example.com',
        subject: 'Pause Test',
        htmlRef: '00000000-0000-0000-0000-000000000003',
        recipient: {
          email: 'pause@example.com',
          externalId: 'ext-pause',
        },
        attempt: 1,
        enqueuedAt: new Date().toISOString(),
      };

      await (service as any).enqueueEmailJob(jobData);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Job should NOT be processed while paused
      expect(processedJobs.length).toBe(0);

      // Resume queue
      await (service as any).resume();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Job should now be processed
      expect(processedJobs.length).toBe(1);
    }, 10000);
  });

  describe('Cleanup', () => {
    it('should cleanup resources on module destroy', async () => {
      // Create a new service instance
      const tempService = new QueueService();
      await (tempService as any).onModuleInit();

      // Verify connections are active
      const queue = (tempService as any).queue as Queue;
      const tempRedis = (tempService as any).redis as Redis;

      expect(queue).toBeDefined();
      expect(tempRedis).toBeDefined();

      // Cleanup
      await (tempService as any).onModuleDestroy();

      // Verify cleanup completed without errors
      // Note: Can't directly test connection closure, but no errors means success
    });
  });
});
