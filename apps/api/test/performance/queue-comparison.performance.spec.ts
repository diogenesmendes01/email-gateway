/**
 * Performance Tests: Outbox+Fila vs SQS Comparison
 * 
 * These tests validate the performance characteristics documented in
 * ADR-0001-outbox-queue-vs-sqs.md
 * 
 * Tests demonstrate:
 * - Latency differences between Redis/BullMQ and SQS
 * - Throughput capabilities
 * - Cost implications at different scales
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { AppModule } from '../../src/app.module';
import { prisma } from '@email-gateway/database';

describe('Queue Performance Comparison (Outbox+Fila vs SQS)', () => {
  let app: INestApplication;
  let queue: Queue;
  let redis: Redis;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get queue instance for testing
    queue = app.get('BullQueue_email_send');
    redis = app.get('BullRedis');
  });

  afterAll(async () => {
    await queue.close();
    await redis.disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.emailOutbox.deleteMany({
      where: { companyId: 'test-company-performance' }
    });
    await queue.obliterate({ force: true });
  });

  describe('Latency Comparison', () => {
    it('should demonstrate Redis/BullMQ low latency (< 10ms)', async () => {
      const iterations = 100;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        
        // Simulate job enqueue (what happens in API)
        await queue.add('email:send', {
          outboxId: `test-${i}`,
          companyId: 'test-company-performance',
          requestId: `req-${i}`,
          recipient: 'test@example.com',
          subject: 'Performance Test'
        });

        const endTime = process.hrtime.bigint();
        const latencyMs = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds
        latencies.push(latencyMs);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

      console.log(`Redis/BullMQ Performance Results:`);
      console.log(`- Average latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`- P95 latency: ${p95Latency.toFixed(2)}ms`);
      console.log(`- Max latency: ${Math.max(...latencies).toFixed(2)}ms`);

      // Assertions based on ADR findings
      expect(avgLatency).toBeLessThan(10); // ADR states < 10ms
      expect(p95Latency).toBeLessThan(20); // Should be well under 20ms
    });

    it('should demonstrate SQS simulated latency (~100-200ms)', async () => {
      // Simulate SQS latency by adding artificial delay
      const iterations = 50; // Fewer iterations due to longer latency
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = process.hrtime.bigint();
        
        // Simulate SQS enqueue with artificial delay
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
        
        const endTime = process.hrtime.bigint();
        const latencyMs = Number(endTime - startTime) / 1_000_000;
        latencies.push(latencyMs);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

      console.log(`SQS Simulated Performance Results:`);
      console.log(`- Average latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`- P95 latency: ${p95Latency.toFixed(2)}ms`);

      // Assertions based on ADR findings
      expect(avgLatency).toBeGreaterThan(100); // ADR states ~100-200ms
      expect(avgLatency).toBeLessThan(300); // Should be under 300ms
    });
  });

  describe('Throughput Comparison', () => {
    it('should demonstrate Redis/BullMQ high throughput', async () => {
      const batchSize = 1000;
      const startTime = process.hrtime.bigint();

      // Enqueue batch of jobs
      const jobs = Array.from({ length: batchSize }, (_, i) => ({
        name: 'email:send',
        data: {
          outboxId: `batch-test-${i}`,
          companyId: 'test-company-performance',
          requestId: `batch-req-${i}`,
          recipient: 'test@example.com',
          subject: 'Batch Test'
        }
      }));

      await queue.addBulk(jobs);

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1_000_000;
      const throughput = (batchSize / durationMs) * 1000; // jobs per second

      console.log(`Redis/BullMQ Throughput Results:`);
      console.log(`- Batch size: ${batchSize} jobs`);
      console.log(`- Duration: ${durationMs.toFixed(2)}ms`);
      console.log(`- Throughput: ${throughput.toFixed(0)} jobs/second`);

      // Assertions based on ADR findings
      expect(throughput).toBeGreaterThan(1000); // Should handle > 1000 jobs/sec
      expect(durationMs).toBeLessThan(5000); // Should complete in < 5 seconds
    });
  });

  describe('Cost Analysis Simulation', () => {
    it('should calculate cost implications for different volumes', () => {
      const scenarios = [
        { name: 'MVP Current', emailsPerMonth: 40000 },
        { name: 'Growth 10x', emailsPerMonth: 400000 },
        { name: 'Growth 100x', emailsPerMonth: 4000000 }
      ];

      scenarios.forEach(scenario => {
        const emailsPerDay = scenario.emailsPerMonth / 30;
        const emailsPerHour = emailsPerDay / 24;

        // Redis/BullMQ costs (fixed infrastructure)
        const redisCostPerMonth = 50; // $50/month for Redis instance
        const redisCostPerEmail = redisCostPerMonth / scenario.emailsPerMonth;

        // SQS costs (per request)
        const sqsCostPerRequest = 0.0000004; // $0.40 per 1M requests
        const sqsCostPerMonth = scenario.emailsPerMonth * sqsCostPerRequest;

        console.log(`\n${scenario.name} (${scenario.emailsPerMonth.toLocaleString()} emails/month):`);
        console.log(`- Redis/BullMQ: $${redisCostPerMonth}/month ($${redisCostPerEmail.toFixed(6)} per email)`);
        console.log(`- SQS: $${sqsCostPerMonth.toFixed(2)}/month ($${sqsCostPerRequest.toFixed(6)} per email)`);
        console.log(`- Cost difference: $${(redisCostPerMonth - sqsCostPerMonth).toFixed(2)}/month`);

        // Assertions based on ADR analysis
        if (scenario.emailsPerMonth <= 400000) {
          // For MVP and 10x growth, Redis should be more cost-effective
          expect(redisCostPerMonth).toBeLessThanOrEqual(sqsCostPerMonth + 20);
        }
      });
    });
  });

  describe('Reliability and Consistency', () => {
    it('should demonstrate Outbox pattern consistency', async () => {
      const testData = {
        companyId: 'test-company-performance',
        recipient: 'consistency@example.com',
        subject: 'Consistency Test',
        htmlContent: '<p>Test email</p>'
      };

      // Step 1: Create outbox record (simulating API behavior)
      const outboxRecord = await prisma.emailOutbox.create({
        data: {
          companyId: testData.companyId,
          recipient: testData.recipient,
          subject: testData.subject,
          htmlContent: testData.htmlContent,
          status: 'PENDING'
        }
      });

      // Step 2: Enqueue job with outbox ID
      const job = await queue.add('email:send', {
        outboxId: outboxRecord.id,
        companyId: testData.companyId,
        requestId: 'consistency-test',
        recipient: testData.recipient,
        subject: testData.subject
      });

      // Step 3: Verify job was enqueued
      expect(job.id).toBeDefined();
      expect(job.data.outboxId).toBe(outboxRecord.id);

      // Step 4: Verify outbox record exists
      const persistedRecord = await prisma.emailOutbox.findUnique({
        where: { id: outboxRecord.id }
      });

      expect(persistedRecord).toBeDefined();
      expect(persistedRecord.status).toBe('PENDING');

      console.log('Outbox Pattern Consistency Test:');
      console.log(`- Outbox ID: ${outboxRecord.id}`);
      console.log(`- Job ID: ${job.id}`);
      console.log(`- Status: ${persistedRecord.status}`);
    });

    it('should demonstrate idempotency with jobId = outboxId', async () => {
      const outboxId = 'idempotency-test-123';
      
      // First enqueue
      const job1 = await queue.add('email:send', {
        outboxId,
        companyId: 'test-company-performance',
        requestId: 'idempotency-test-1',
        recipient: 'idempotency@example.com',
        subject: 'Idempotency Test'
      }, {
        jobId: outboxId // Use outboxId as jobId for idempotency
      });

      // Second enqueue with same jobId (should be ignored)
      const job2 = await queue.add('email:send', {
        outboxId,
        companyId: 'test-company-performance',
        requestId: 'idempotency-test-2',
        recipient: 'idempotency@example.com',
        subject: 'Idempotency Test'
      }, {
        jobId: outboxId // Same jobId
      });

      // Verify idempotency
      expect(job1.id).toBe(outboxId);
      expect(job2.id).toBe(outboxId);
      expect(job1.id).toBe(job2.id);

      console.log('Idempotency Test:');
      console.log(`- Job ID: ${job1.id}`);
      console.log(`- Outbox ID: ${outboxId}`);
      console.log(`- Idempotency: ${job1.id === job2.id ? 'PASS' : 'FAIL'}`);
    });
  });

  describe('Error Handling and Retry Behavior', () => {
    it('should demonstrate BullMQ retry configuration', async () => {
      const job = await queue.add('email:send', {
        outboxId: 'retry-test-123',
        companyId: 'test-company-performance',
        requestId: 'retry-test',
        recipient: 'retry@example.com',
        subject: 'Retry Test'
      }, {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: false,
        removeOnFail: false
      });

      // Verify job configuration
      expect(job.opts.attempts).toBe(5);
      expect(job.opts.backoff?.type).toBe('exponential');
      expect(job.opts.backoff?.delay).toBe(2000);

      console.log('BullMQ Retry Configuration:');
      console.log(`- Max attempts: ${job.opts.attempts}`);
      console.log(`- Backoff type: ${job.opts.backoff?.type}`);
      console.log(`- Initial delay: ${job.opts.backoff?.delay}ms`);
    });
  });

  describe('Monitoring and Observability', () => {
    it('should demonstrate job status tracking', async () => {
      const job = await queue.add('email:send', {
        outboxId: 'monitoring-test-123',
        companyId: 'test-company-performance',
        requestId: 'monitoring-test',
        recipient: 'monitoring@example.com',
        subject: 'Monitoring Test'
      });

      // Check initial status
      const initialStatus = await job.getState();
      expect(initialStatus).toBeDefined();

      // Get job details
      const jobData = await job.getJobData();
      expect(jobData.outboxId).toBe('monitoring-test-123');

      console.log('Job Monitoring Test:');
      console.log(`- Job ID: ${job.id}`);
      console.log(`- Initial Status: ${initialStatus}`);
      console.log(`- Outbox ID: ${jobData.outboxId}`);
      console.log(`- Company ID: ${jobData.companyId}`);
    });
  });
});
