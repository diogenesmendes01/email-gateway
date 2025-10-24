/**
 * Recipient Encryption E2E Tests
 *
 * TASK-011: Tests complete encryption flow
 * - API receives CPF/CNPJ → Encrypts → Stores → Retrieves → Decrypts
 *
 * @see task/TASK-011-ENCRYPTION-E2E-TESTS.md
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { prisma } from '@email-gateway/database';
import {
  decryptCpfCnpj,
  hashCpfCnpjSha256,
} from '@email-gateway/shared';

describe('Recipient Encryption (E2E)', () => {
  let app: INestApplication;
  let apiKey: string;
  let companyId: string;

  beforeAll(async () => {
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

    // Setup test company with API key
    const testCompany = await prisma.company.create({
      data: {
        name: 'E2E Test Company',
        apiKey: 'test_e2e_key_12345678901234567890',
        apiKeyHash: 'e2e_test_hash',
        apiKeyPrefix: 'test_e2e',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        isActive: true,
      },
    });

    companyId = testCompany.id;
    apiKey = testCompany.apiKey;
  });

  afterAll(async () => {
    // Cleanup: Delete test company (cascade will delete recipients)
    if (companyId) {
      await prisma.company.delete({ where: { id: companyId } });
    }
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // Clean recipients before each test
    await prisma.recipient.deleteMany({ where: { companyId } });
  });

  describe('POST /v1/email/send - CPF/CNPJ encryption', () => {
    it('should encrypt CPF/CNPJ when creating recipient', async () => {
      const cpf = '12345678901';
      const email = 'encryption-test@example.com';

      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: email,
          subject: 'Encryption Test Email',
          html: '<p>Testing CPF encryption</p>',
          recipient: {
            email,
            cpfCnpj: cpf,
            nome: 'Test User',
          },
        })
        .expect(201);

      expect(response.body.outboxId).toBeDefined();
      expect(response.body.status).toBe('ENQUEUED');

      // Verify data in database
      const recipient = await prisma.recipient.findFirst({
        where: { email, companyId },
      });

      expect(recipient).toBeDefined();
      expect(recipient.cpfCnpjEnc).toBeDefined();
      expect(recipient.cpfCnpjSalt).toBeDefined();
      expect(recipient.cpfCnpjHash).toBeDefined();

      // Verify encrypted value is not plaintext
      expect(recipient.cpfCnpjEnc).not.toBe(cpf);
      expect(recipient.cpfCnpjEnc).not.toContain(cpf);

      // Verify encryption format (iv:encrypted:authTag for AES-256-GCM)
      expect(recipient.cpfCnpjEnc.split(':')).toHaveLength(3);

      // Verify salt is base64
      expect(recipient.cpfCnpjSalt).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('should generate correct hash for CPF search', async () => {
      const cpf = '12345678901';
      const email = 'hash-test@example.com';

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: email,
          subject: 'Hash Test',
          html: '<p>Testing hash</p>',
          recipient: { email, cpfCnpj: cpf },
        })
        .expect(201);

      // Search by hash
      const expectedHash = hashCpfCnpjSha256(cpf);
      const recipient = await prisma.recipient.findFirst({
        where: { cpfCnpjHash: expectedHash, companyId },
      });

      expect(recipient).toBeDefined();
      expect(recipient.email).toBe(email);
    });

    it('should decrypt CPF/CNPJ with correct key', async () => {
      const cpf = '12345678901';
      const email = 'decrypt-test@example.com';

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: email,
          subject: 'Decrypt Test',
          html: '<p>Testing decryption</p>',
          recipient: { email, cpfCnpj: cpf },
        })
        .expect(201);

      const recipient = await prisma.recipient.findFirst({
        where: { email, companyId },
      });

      // Decrypt
      const decrypted = decryptCpfCnpj(
        recipient.cpfCnpjEnc,
        process.env.ENCRYPTION_KEY,
        recipient.cpfCnpjSalt
      );

      expect(decrypted).toBe(cpf);
    });

    it('should work with CNPJ (14 digits)', async () => {
      const cnpj = '12345678000190';
      const email = 'cnpj-test@example.com';

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: email,
          subject: 'CNPJ Test',
          html: '<p>Testing CNPJ</p>',
          recipient: {
            email,
            cpfCnpj: cnpj,
            razaoSocial: 'Test Company LTDA',
          },
        })
        .expect(201);

      const recipient = await prisma.recipient.findFirst({
        where: { email, companyId },
      });

      expect(recipient.cpfCnpjEnc).toBeDefined();

      const decrypted = decryptCpfCnpj(
        recipient.cpfCnpjEnc,
        process.env.ENCRYPTION_KEY,
        recipient.cpfCnpjSalt
      );

      expect(decrypted).toBe(cnpj);
    });
  });

  describe('Unique salt per recipient', () => {
    it('should use unique salt for each recipient with same CPF', async () => {
      const cpf = '12345678901';

      // Create two recipients with same CPF
      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'user1@example.com',
          subject: 'Test 1',
          html: '<p>Test 1</p>',
          recipient: { email: 'user1@example.com', cpfCnpj: cpf },
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'user2@example.com',
          subject: 'Test 2',
          html: '<p>Test 2</p>',
          recipient: { email: 'user2@example.com', cpfCnpj: cpf },
        })
        .expect(201);

      const recipients = await prisma.recipient.findMany({
        where: { companyId },
        orderBy: { createdAt: 'asc' },
      });

      expect(recipients).toHaveLength(2);

      // Verify salts are different
      expect(recipients[0].cpfCnpjSalt).not.toBe(recipients[1].cpfCnpjSalt);

      // Verify encrypted values are different
      expect(recipients[0].cpfCnpjEnc).not.toBe(recipients[1].cpfCnpjEnc);

      // But hashes are equal (for search)
      expect(recipients[0].cpfCnpjHash).toBe(recipients[1].cpfCnpjHash);

      // Both decrypt to the same CPF
      const decrypted1 = decryptCpfCnpj(
        recipients[0].cpfCnpjEnc,
        process.env.ENCRYPTION_KEY,
        recipients[0].cpfCnpjSalt
      );
      const decrypted2 = decryptCpfCnpj(
        recipients[1].cpfCnpjEnc,
        process.env.ENCRYPTION_KEY,
        recipients[1].cpfCnpjSalt
      );

      expect(decrypted1).toBe(cpf);
      expect(decrypted2).toBe(cpf);
    });
  });

  describe('API should never return CPF/CNPJ plaintext', () => {
    it('should not return CPF/CNPJ or encrypted fields in response', async () => {
      const cpf = '12345678901';
      const email = 'privacy-test@example.com';

      const response = await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: email,
          subject: 'Privacy Test',
          html: '<p>Testing privacy</p>',
          recipient: { email, cpfCnpj: cpf },
        })
        .expect(201);

      const body = JSON.stringify(response.body);

      // Verify CPF never appears in response
      expect(body).not.toContain(cpf);
      expect(body).not.toContain('cpfCnpj');
      expect(body).not.toContain('cpfCnpjEnc');
      expect(body).not.toContain('cpfCnpjSalt');
      expect(body).not.toContain('cpfCnpjHash');
    });
  });

  describe('Search by CPF hash', () => {
    it('should find recipients by CPF hash', async () => {
      const cpf = '12345678901';
      const email = 'search-test@example.com';

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: email,
          subject: 'Search Test',
          html: '<p>Testing search</p>',
          recipient: { email, cpfCnpj: cpf },
        })
        .expect(201);

      // Search using hash
      const hash = hashCpfCnpjSha256(cpf);
      const found = await prisma.recipient.findFirst({
        where: { cpfCnpjHash: hash, companyId },
      });

      expect(found).toBeDefined();
      expect(found.email).toBe(email);
    });

    it('should not find recipient with wrong CPF', async () => {
      const email = 'wrong-search-test@example.com';

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: email,
          subject: 'Test',
          html: '<p>Test</p>',
          recipient: { email, cpfCnpj: '12345678901' },
        })
        .expect(201);

      // Search with different CPF
      const wrongHash = hashCpfCnpjSha256('99999999999');
      const found = await prisma.recipient.findFirst({
        where: { cpfCnpjHash: wrongHash, companyId },
      });

      expect(found).toBeNull();
    });
  });

  describe('Error cases', () => {
    it('should handle emails without CPF/CNPJ', async () => {
      const email = 'no-cpf-test@example.com';

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: email,
          subject: 'No CPF Test',
          html: '<p>No CPF/CNPJ provided</p>',
          recipient: { email },
        })
        .expect(201);

      const recipient = await prisma.recipient.findFirst({
        where: { email, companyId },
      });

      // Should create recipient but without encrypted fields
      expect(recipient).toBeDefined();
      expect(recipient.cpfCnpjEnc).toBeNull();
      expect(recipient.cpfCnpjSalt).toBeNull();
      expect(recipient.cpfCnpjHash).toBeNull();
    });

    it('should reject invalid CPF format', async () => {
      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'invalid-cpf@example.com',
          subject: 'Invalid CPF',
          html: '<p>Test</p>',
          recipient: {
            email: 'invalid-cpf@example.com',
            cpfCnpj: '123', // Too short
          },
        })
        .expect(400);
    });

    it('should reject CPF with non-numeric characters', async () => {
      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'non-numeric@example.com',
          subject: 'Non-numeric CPF',
          html: '<p>Test</p>',
          recipient: {
            email: 'non-numeric@example.com',
            cpfCnpj: 'abc.def.ghi-jk', // Invalid characters
          },
        })
        .expect(400);
    });
  });

  describe('Performance', () => {
    it('should encrypt within acceptable time (< 500ms)', async () => {
      const startTime = Date.now();

      await request(app.getHttpServer())
        .post('/v1/email/send')
        .set('x-api-key', apiKey)
        .send({
          to: 'perf-test@example.com',
          subject: 'Performance Test',
          html: '<p>Testing performance</p>',
          recipient: {
            email: 'perf-test@example.com',
            cpfCnpj: '12345678901',
          },
        })
        .expect(201);

      const duration = Date.now() - startTime;

      // Should complete within 500ms (including network, DB, encryption)
      expect(duration).toBeLessThan(500);
    });
  });
});
