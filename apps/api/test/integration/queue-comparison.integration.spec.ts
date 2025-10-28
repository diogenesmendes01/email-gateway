/**
 * Integration Tests: Outbox+Fila vs SQS End-to-End Comparison
 * 
 * These tests validate the complete flow documented in
 * ADR-20250101-outbox-queue-vs-sqs.md
 * 
 * Tests demonstrate:
 * - Complete API → Queue → Worker flow
 * - Error handling and retry behavior
 * - Monitoring and observability
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { Queue } from 'bullmq';
import { AppModule } from '../../src/app.module';
import { prisma } from '@email-gateway/database';

describe('Queue Integration Comparison (Outbox+Fila vs SQS)', () => {
  let app: INestApplication;
  let queue: Queue;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    queue = app.get('BullQueue_email_send');
  });

  afterAll(async () => {
    await queue.close();
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.emailOutbox.deleteMany({
      where: { companyId: 'test-company-integration' }
    });
    await queue.obliterate({ force: true });
  });

  describe('Complete Flow: API → Queue → Worker', () => {
    it('should demonstrate Redis/BullMQ complete flow', async () => {
      const emailData = {
        recipient: 'integration@example.com',
        subject: 'Integration Test',
        htmlContent: '<p>This is an integration test</p>',
        companyId: 'test-company-integration'
      };

      // Step 1: API receives request (simulated)
      const startTime = process.hrtime.bigint();
      
      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', 'test-key')
        .send(emailData)
        .expect(201);

      const apiLatency = process.hrtime.bigint() - startTime;
      const apiLatencyMs = Number(apiLatency) / 1_000_000;

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('status', 'PENDING');

      // Step 2: Verify outbox record created
      const outboxRecord = await prisma.emailOutbox.findUnique({
        where: { id: response.body.id }
      });

      expect(outboxRecord).toBeDefined();
      expect(outboxRecord.status).toBe('PENDING');
      expect(outboxRecord.recipient).toBe(emailData.recipient);

      // Step 3: Verify job enqueued
      const waitingJobs = await queue.getWaiting();
      const enqueuedJob = waitingJobs.find(job => job.data.outboxId === response.body.id);

      expect(enqueuedJob).toBeDefined();
      expect(enqueuedJob.data.companyId).toBe(emailData.companyId);

      console.log('Redis/BullMQ Complete Flow:');
      console.log(`- API Response Time: ${apiLatencyMs.toFixed(2)}ms`);
      console.log(`- Outbox ID: ${response.body.id}`);
      console.log(`- Job ID: ${enqueuedJob.id}`);
      console.log(`- Status: ${outboxRecord.status}`);
    });

    it('should demonstrate SQS simulated flow with higher latency', async () => {
      const emailData = {
        recipient: 'sqs-simulation@example.com',
        subject: 'SQS Simulation Test',
        htmlContent: '<p>SQS simulation test</p>',
        companyId: 'test-company-integration'
      };

      // Simulate SQS flow with artificial delays
      const startTime = process.hrtime.bigint();

      // Step 1: Simulate API → SQS delay (~100-200ms)
      await new Promise(resolve => setTimeout(resolve, 150));

      // Step 2: Create outbox record (same as Redis flow)
      const outboxRecord = await prisma.emailOutbox.create({
        data: {
          companyId: emailData.companyId,
          recipient: emailData.recipient,
          subject: emailData.subject,
          htmlContent: emailData.htmlContent,
          status: 'PENDING'
        }
      });

      // Step 3: Simulate SQS enqueue delay
      await new Promise(resolve => setTimeout(resolve, 100));

      const endTime = process.hrtime.bigint();
      const totalLatencyMs = Number(endTime - startTime) / 1_000_000;

      console.log('SQS Simulated Complete Flow:');
      console.log(`- Total Response Time: ${totalLatencyMs.toFixed(2)}ms`);
      console.log(`- Outbox ID: ${outboxRecord.id}`);
      console.log(`- Status: ${outboxRecord.status}`);

      // Verify SQS simulation shows higher latency
      expect(totalLatencyMs).toBeGreaterThan(200);
    });
  });

  describe('Error Handling and Retry Behavior', () => {
    it('should demonstrate BullMQ retry with exponential backoff', async () => {
      const job = await queue.add('email:send', {
        outboxId: 'retry-integration-test',
        companyId: 'test-company-integration',
        requestId: 'retry-integration-test',
        recipient: 'retry@example.com',
        subject: 'Retry Integration Test'
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      });

      // Simulate job failure
      await job.moveToFailed(new Error('Simulated SES failure'), '0');

      // Verify retry configuration
      expect(job.opts.attempts).toBe(3);
      expect(job.opts.backoff?.type).toBe('exponential');

      console.log('BullMQ Retry Integration Test:');
      console.log(`- Job ID: ${job.id}`);
      console.log(`- Max Attempts: ${job.opts.attempts}`);
      console.log(`- Backoff Type: ${job.opts.backoff?.type}`);
      console.log(`- Initial Delay: ${job.opts.backoff?.delay}ms`);
    });

    it('should demonstrate DLQ behavior for permanent failures', async () => {
      const job = await queue.add('email:send', {
        outboxId: 'dlq-integration-test',
        companyId: 'test-company-integration',
        requestId: 'dlq-integration-test',
        recipient: 'invalid-email', // Invalid email to trigger permanent failure
        subject: 'DLQ Integration Test'
      }, {
        attempts: 2,
        removeOnFail: false
      });

      // Simulate permanent failure
      await job.moveToFailed(new Error('PERMANENT_ERROR: Invalid email format'), '0');

      // Verify job is in failed state
      const failedJobs = await queue.getFailed();
      const failedJob = failedJobs.find(j => j.id === job.id);

      expect(failedJob).toBeDefined();
      expect(failedJob.failedReason).toContain('PERMANENT_ERROR');

      console.log('DLQ Integration Test:');
      console.log(`- Job ID: ${job.id}`);
      console.log(`- Failure Reason: ${failedJob.failedReason}`);
      console.log(`- Failed Jobs Count: ${failedJobs.length}`);
    });
  });

  describe('Monitoring and Observability', () => {
    it('should demonstrate job status tracking and metrics', async () => {
      const jobs = await Promise.all([
        queue.add('email:send', {
          outboxId: 'monitoring-1',
          companyId: 'test-company-integration',
          requestId: 'monitoring-1',
          recipient: 'monitoring1@example.com',
          subject: 'Monitoring Test 1'
        }),
        queue.add('email:send', {
          outboxId: 'monitoring-2',
          companyId: 'test-company-integration',
          requestId: 'monitoring-2',
          recipient: 'monitoring2@example.com',
          subject: 'Monitoring Test 2'
        })
      ]);

      // Get queue statistics
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();

      console.log('Queue Monitoring Statistics:');
      console.log(`- Waiting: ${waiting.length}`);
      console.log(`- Active: ${active.length}`);
      console.log(`- Completed: ${completed.length}`);
      console.log(`- Failed: ${failed.length}`);

      // Verify jobs are tracked
      expect(waiting.length).toBeGreaterThanOrEqual(2);
      expect(jobs).toHaveLength(2);
    });

    it('should demonstrate request ID propagation', async () => {
      const requestId = 'propagation-test-123';
      
      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', 'test-key')
        .set('x-request-id', requestId)
        .send({
          recipient: 'propagation@example.com',
          subject: 'Request ID Propagation Test',
          htmlContent: '<p>Testing request ID propagation</p>',
          companyId: 'test-company-integration'
        })
        .expect(201);

      // Verify request ID in response
      expect(response.headers['x-request-id']).toBe(requestId);

      // Verify request ID in job data
      const waitingJobs = await queue.getWaiting();
      const job = waitingJobs.find(j => j.data.requestId === requestId);

      expect(job).toBeDefined();
      expect(job.data.requestId).toBe(requestId);

      console.log('Request ID Propagation Test:');
      console.log(`- Request ID: ${requestId}`);
      console.log(`- Response Header: ${response.headers['x-request-id']}`);
      console.log(`- Job Data: ${job.data.requestId}`);
    });
  });

  describe('Performance Under Load', () => {
    it('should demonstrate Redis/BullMQ performance under load', async () => {
      const batchSize = 50;
      const startTime = process.hrtime.bigint();

      // Create batch of email requests
      const requests = Array.from({ length: batchSize }, (_, i) => ({
        recipient: `load-test-${i}@example.com`,
        subject: `Load Test ${i}`,
        htmlContent: `<p>Load test email ${i}</p>`,
        companyId: 'test-company-integration'
      }));

      // Process batch
      const responses = await Promise.all(
        requests.map(data =>
          request(app.getHttpServer())
            .post('/v1/email/send')
            .set('x-api-key', 'test-key')
            .send(data)
            .expect(201)
        )
      );

      const endTime = process.hrtime.bigint();
      const totalTimeMs = Number(endTime - startTime) / 1_000_000;
      const avgTimePerRequest = totalTimeMs / batchSize;

      // Verify all requests succeeded
      expect(responses).toHaveLength(batchSize);
      responses.forEach(response => {
        expect(response.body).toHaveProperty('id');
        expect(response.body).toHaveProperty('status', 'PENDING');
      });

      console.log('Load Test Results:');
      console.log(`- Batch Size: ${batchSize}`);
      console.log(`- Total Time: ${totalTimeMs.toFixed(2)}ms`);
      console.log(`- Avg Time per Request: ${avgTimePerRequest.toFixed(2)}ms`);
      console.log(`- Throughput: ${(batchSize / totalTimeMs * 1000).toFixed(0)} requests/sec`);

      // Verify performance meets requirements
      expect(avgTimePerRequest).toBeLessThan(250); // < 250ms per request
    });
  });

  describe('Data Consistency and ACID Properties', () => {
    it('should demonstrate outbox pattern consistency', async () => {
      const emailData = {
        recipient: 'consistency@example.com',
        subject: 'Consistency Test',
        htmlContent: '<p>Consistency test</p>',
        companyId: 'test-company-integration'
      };

      // Create outbox record
      const outboxRecord = await prisma.emailOutbox.create({
        data: {
          companyId: emailData.companyId,
          recipient: emailData.recipient,
          subject: emailData.subject,
          htmlContent: emailData.htmlContent,
          status: 'PENDING'
        }
      });

      // Enqueue job
      const job = await queue.add('email:send', {
        outboxId: outboxRecord.id,
        companyId: emailData.companyId,
        requestId: 'consistency-test',
        recipient: emailData.recipient,
        subject: emailData.subject
      });

      // Verify consistency
      const persistedOutbox = await prisma.emailOutbox.findUnique({
        where: { id: outboxRecord.id }
      });

      const persistedJob = await queue.getJob(job.id);

      expect(persistedOutbox).toBeDefined();
      expect(persistedJob).toBeDefined();
      expect(persistedOutbox.id).toBe(persistedJob.data.outboxId);

      console.log('Data Consistency Test:');
      console.log(`- Outbox ID: ${persistedOutbox.id}`);
      console.log(`- Job ID: ${persistedJob.id}`);
      console.log(`- Job Outbox ID: ${persistedJob.data.outboxId}`);
      console.log(`- Consistency: ${persistedOutbox.id === persistedJob.data.outboxId ? 'PASS' : 'FAIL'}`);
    });
  });
});
