import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { prisma } from '@email-gateway/database';

describe('Email Queue Integration (API → Queue)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should enqueue a job when sending an email', async () => {
    // Arrange
    const payload = {
      to: 'itest@example.com',
      subject: 'Integration Test',
      html: '<p>Test</p>',
      recipient: { email: 'itest@example.com', externalId: 'e2e-1' },
    };

    // Act
    const res = await request(app.getHttpServer())
      .post('/v1/email/send')
      .set('x-api-key', 'test-key')
      .send(payload)
      .expect(201);

    // Assert response
    expect(res.body).toHaveProperty('outboxId');
    expect(res.body).toHaveProperty('jobId');
    expect(res.body.status).toBeDefined();

    // Assert outbox updated
    const outbox = await prisma.emailOutbox.findUnique({ where: { id: res.body.outboxId } });
    expect(outbox?.status).toBeDefined();
  });
});


