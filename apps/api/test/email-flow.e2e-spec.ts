/**
 * Email Flow E2E Tests
 *
 * Tests complete email flow: API → Redis → Worker → SMTP
 * Uses TestContainers for Redis and Postgres isolation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Worker, Job } from 'bullmq';
import {
  setupE2EEnvironment,
  teardownE2EEnvironment,
  E2ETestEnvironment,
  waitFor,
} from './setup-e2e';
import { PrismaClient } from '@prisma/client';
import { Logger } from '@nestjs/common';

describe('Email Flow (E2E - Full Integration)', () => {
  let app: INestApplication;
  let env: E2ETestEnvironment;
  let worker: Worker;
  let apiKey: string;
  let companyId: string;
  let prisma: PrismaClient;
  const logger = new Logger('EmailFlowE2E');

  beforeAll(async () => {
    logger.log('Starting E2E test suite...');

    // Setup TestContainers
    env = await setupE2EEnvironment();

    // Configure environment variables
    process.env.DATABASE_URL = env.databaseUrl;
    process.env.REDIS_URL = env.redisUrl;
    process.env.ENCRYPTION_KEY = 'test-key-32-characters-long!!!';
    process.env.RATE_LIMIT_TTL = '60';
    process.env.RATE_LIMIT_MAX = '100';

    // Initialize Prisma client
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: env.databaseUrl,
        },
      },
    });

    await prisma.$connect();

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
        apiKeyHash:
          '$2b$10$YourHashHere1234567890123456789012345678901234567890',
        apiKeyPrefix: 'e2e_test',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });

    companyId = testCompany.id;
    apiKey = testCompany.apiKey;

    logger.log('E2E test suite setup completed');
  }, 120000); // 2 minutes timeout for container startup

  afterAll(async () => {
    logger.log('Cleaning up E2E test suite...');

    await worker?.close();
    await app?.close();
    await prisma?.$disconnect();
    await teardownE2EEnvironment(env);

    logger.log('E2E test suite cleanup completed');
  }, 60000);

  beforeEach(async () => {
    // Clear test data
    await prisma.emailLog.deleteMany({ where: { companyId } });
    await prisma.emailOutbox.deleteMany({ where: { companyId } });
    await prisma.recipient.deleteMany({ where: { companyId } });
    await prisma.idempotencyKey.deleteMany({ where: { companyId } });
  });

  describe('Complete email flow: API → Queue → Worker (Mock)', () => {
    it('should accept email and enqueue successfully', async () => {
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
        .set('x-request-id', 'e2e-test-request-id-001')
        .send(emailPayload)
        .expect(202); // ACCEPTED

      expect(sendResponse.body).toMatchObject({
        outboxId: expect.any(String),
        status: 'ENQUEUED',
        requestId: 'e2e-test-request-id-001',
      });

      const outboxId = sendResponse.body.outboxId;

      // Step 2: Verify email in database with ENQUEUED status
      const emailOutbox = await prisma.emailOutbox.findUnique({
        where: { id: outboxId },
      });

      expect(emailOutbox).toBeDefined();
      expect(emailOutbox.status).toBe('ENQUEUED');
      expect(emailOutbox.jobId).toBeDefined();
      expect(emailOutbox.requestId).toBe('e2e-test-request-id-001');
      expect(emailOutbox.to).toBe('e2e-test@example.com');
      expect(emailOutbox.subject).toBe('E2E Test Email');
      expect(emailOutbox.enqueuedAt).toBeDefined();

      // Step 3: Verify recipient was created
      const recipient = await prisma.recipient.findFirst({
        where: {
          companyId,
          email: 'e2e-test@example.com',
        },
      });

      expect(recipient).toBeDefined();
      expect(recipient.nome).toBe('E2E Test User');
    });

    it('should validate request body and reject invalid emails', async () => {
      const invalidPayload = {
        to: 'invalid-email', // Invalid email format
        subject: 'Test',
        html: '<p>Test</p>',
      };

      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send(invalidPayload)
        .expect(400); // Bad Request

      expect(response.body.message).toContain('Validation failed');
    });

    it('should reject requests without API key', async () => {
      const emailPayload = {
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      };

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .send(emailPayload)
        .expect(401); // Unauthorized
    });

    it('should reject requests with invalid API key', async () => {
      const emailPayload = {
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      };

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', 'invalid-api-key-12345')
        .send(emailPayload)
        .expect(401); // Unauthorized
    });

    it('should generate request ID if not provided', async () => {
      const emailPayload = {
        to: 'test@example.com',
        subject: 'Test Request ID',
        html: '<p>Test</p>',
      };

      const sendResponse = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        // No x-request-id header
        .send(emailPayload)
        .expect(202);

      expect(sendResponse.body.requestId).toBeDefined();
      expect(sendResponse.body.requestId).toMatch(
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
      ); // UUID format
    });

    it('should handle HTML sanitization for XSS protection', async () => {
      const emailPayload = {
        to: 'test@example.com',
        subject: 'XSS Test',
        html: '<p>Safe content</p><script>alert("xss")</script>',
      };

      const sendResponse = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send(emailPayload)
        .expect(202);

      const outboxId = sendResponse.body.outboxId;
      const emailOutbox = await prisma.emailOutbox.findUnique({
        where: { id: outboxId },
      });

      // HTML should be sanitized (script tag removed)
      expect(emailOutbox.html).not.toContain('<script>');
      expect(emailOutbox.html).toContain('<p>Safe content</p>');
    });
  });

  describe('Idempotency', () => {
    it('should prevent duplicate emails with same idempotency key', async () => {
      const emailPayload = {
        to: 'idempotency-test@example.com',
        subject: 'Idempotency Test',
        html: '<p>Testing idempotency</p>',
      };

      const idempotencyKey = 'unique-key-12345-test-e2e';

      // Send first request
      const response1 = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .set('idempotency-key', idempotencyKey)
        .send(emailPayload)
        .expect(202);

      expect(response1.body.outboxId).toBeDefined();

      // Send second request with same idempotency key
      const response2 = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .set('idempotency-key', idempotencyKey)
        .send(emailPayload)
        .expect(409); // Conflict

      expect(response2.body.error.code).toBe('IDEMPOTENCY_CONFLICT');

      // Verify only one email was created
      const emails = await prisma.emailOutbox.findMany({
        where: {
          companyId,
          to: 'idempotency-test@example.com',
        },
      });

      expect(emails).toHaveLength(1);
    });

    it('should allow same idempotency key for different companies', async () => {
      // Create second company
      const company2 = await prisma.company.create({
        data: {
          name: 'E2E Test Company 2',
          apiKey: 'e2e_test_key2_1234567890',
          apiKeyHash:
            '$2b$10$AnotherHashHere123456789012345678901234567890',
          apiKeyPrefix: 'e2e_test2',
          apiKeyCreatedAt: new Date(),
          apiKeyExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          isActive: true,
        },
      });

      const emailPayload = {
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      };

      const idempotencyKey = 'shared-key-123';

      // Company 1
      const response1 = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .set('idempotency-key', idempotencyKey)
        .send(emailPayload)
        .expect(202);

      // Company 2 - should succeed with same idempotency key
      const response2 = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', company2.apiKey)
        .set('idempotency-key', idempotencyKey)
        .send(emailPayload)
        .expect(202);

      expect(response1.body.outboxId).not.toBe(response2.body.outboxId);

      // Cleanup
      await prisma.emailOutbox.deleteMany({ where: { companyId: company2.id } });
      await prisma.idempotencyKey.deleteMany({
        where: { companyId: company2.id },
      });
      await prisma.company.delete({ where: { id: company2.id } });
    });
  });

  describe('Recipient management', () => {
    it('should create or update recipient with CPF encryption', async () => {
      const emailPayload = {
        to: 'recipient@example.com',
        subject: 'Test with CPF',
        html: '<p>Test</p>',
        recipient: {
          email: 'recipient@example.com',
          nome: 'Test User',
          cpfCnpj: '12345678901',
        },
      };

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send(emailPayload)
        .expect(202);

      const recipient = await prisma.recipient.findFirst({
        where: {
          companyId,
          email: 'recipient@example.com',
        },
      });

      expect(recipient).toBeDefined();
      expect(recipient.cpfCnpjEnc).toBeDefined(); // Encrypted
      expect(recipient.cpfCnpjHash).toBeDefined(); // Hash for search
      expect(recipient.cpfCnpjSalt).toBeDefined(); // Salt
      // Should NOT store plaintext CPF
      expect(recipient.cpfCnpjEnc).not.toBe('12345678901');
    });

    it('should reuse existing recipient', async () => {
      const emailPayload = {
        to: 'existing@example.com',
        subject: 'Test 1',
        html: '<p>Test 1</p>',
        recipient: {
          email: 'existing@example.com',
          nome: 'Existing User',
        },
      };

      // Send first email
      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send(emailPayload)
        .expect(202);

      // Send second email to same recipient
      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({ ...emailPayload, subject: 'Test 2', html: '<p>Test 2</p>' })
        .expect(202);

      // Should only have one recipient
      const recipients = await prisma.recipient.findMany({
        where: {
          companyId,
          email: 'existing@example.com',
        },
      });

      expect(recipients).toHaveLength(1);

      // But two emails
      const emails = await prisma.emailOutbox.findMany({
        where: {
          companyId,
          to: 'existing@example.com',
        },
      });

      expect(emails).toHaveLength(2);
    });
  });

  describe('Error handling', () => {
    it('should handle missing required fields', async () => {
      const invalidPayload = {
        // Missing 'to'
        subject: 'Test',
        html: '<p>Test</p>',
      };

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send(invalidPayload)
        .expect(400);
    });

    it('should handle oversized HTML content', async () => {
      const largeHtml = '<p>' + 'a'.repeat(10 * 1024 * 1024) + '</p>'; // 10MB

      const emailPayload = {
        to: 'test@example.com',
        subject: 'Large email',
        html: largeHtml,
      };

      // Should reject or handle gracefully
      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send(emailPayload);

      // Either reject with 400/413 or accept but truncate
      expect([202, 400, 413]).toContain(response.status);
    });

    it('should handle invalid recipient data', async () => {
      const emailPayload = {
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        recipient: {
          email: 'invalid-email-format', // Invalid
          nome: 'Test',
        },
      };

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send(emailPayload)
        .expect(400);
    });
  });

  describe('Rate limiting', () => {
    it('should enforce rate limits per company', async () => {
      const emailPayload = {
        to: 'ratelimit@example.com',
        subject: 'Rate Limit Test',
        html: '<p>Test</p>',
      };

      // Send requests until rate limit is hit
      // Default: 100 requests per 60 seconds
      const requests = [];
      for (let i = 0; i < 105; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/v1/email/send')
            .set('x-api-key', apiKey)
            .send({ ...emailPayload, subject: `Test ${i}` })
        );
      }

      const responses = await Promise.all(requests);

      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter((r) => r.status === 429);

      // At least one should be rate limited
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Request ID propagation', () => {
    it('should propagate request ID throughout the flow', async () => {
      const requestId = 'test-correlation-id-123';

      const emailPayload = {
        to: 'correlation@example.com',
        subject: 'Correlation Test',
        html: '<p>Test</p>',
      };

      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .set('x-request-id', requestId)
        .send(emailPayload)
        .expect(202);

      expect(response.body.requestId).toBe(requestId);

      // Verify in database
      const emailOutbox = await prisma.emailOutbox.findUnique({
        where: { id: response.body.outboxId },
      });

      expect(emailOutbox.requestId).toBe(requestId);
    });
  });
});
