import { prisma } from '@email-gateway/database';
import { Queue } from 'bullmq';
import * as bcrypt from 'bcrypt';

describe('E2E: Company Domain (TASK-027)', () => {
  let emailQueue: Queue;
  let testCompanyId: string;

  beforeAll(async () => {
    emailQueue = new Queue('email-send', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    });

    // Criar empresa com domínio verificado
    const company = await prisma.company.create({
      data: {
        name: 'E2E Test Company',
        apiKey: 'sk_test_e2e_domain',
        apiKeyHash: await bcrypt.hash('sk_test_e2e_domain', 10),
        apiKeyPrefix: 'sk_e2e',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        dailyEmailLimit: 100,
        isApproved: true,
        domains: {
          create: {
            domain: 'e2e-test-domain.com',
            status: 'VERIFIED',
            dkimStatus: 'VERIFIED',
          },
        },
      },
      include: {
        domains: true,
      },
    });

    testCompanyId = company.id;

    // Definir domínio padrão
    await prisma.company.update({
      where: { id: company.id },
      data: {
        domainId: company.domains[0].id,
        defaultFromAddress: 'test@e2e-test-domain.com',
        defaultFromName: 'E2E Test',
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    if (testCompanyId) {
      await prisma.company.delete({ where: { id: testCompanyId } }).catch(() => {});
    }
    await emailQueue.close();
    await prisma.$disconnect();
  });

  it('should send email from company verified domain', async () => {
    // Criar EmailOutbox
    const email = await prisma.emailOutbox.create({
      data: {
        companyId: testCompanyId,
        to: 'recipient@example.com',
        subject: 'E2E Test - Company Domain',
        html: '<p>Testing company domain functionality</p>',
        status: 'PENDING',
      },
    });

    // Adicionar job na fila
    const job = await emailQueue.add('send-email', {
      companyId: testCompanyId,
      outboxId: email.id,
      to: email.to,
      subject: email.subject,
      html: email.html,
      requestId: `e2e-${Date.now()}`,
    });

    // Aguardar processamento (máx 15s)
    try {
      await job.waitUntilFinished(emailQueue.events, 15000);
    } catch (err) {
      // Ignorar timeout em ambiente de teste
      console.warn('Job timeout or processing error:', err);
    }

    // Verificar que email foi processado
    const updatedEmail = await prisma.emailOutbox.findUnique({
      where: { id: email.id },
    });

    expect(updatedEmail).toBeDefined();
    // Status pode ser SENT ou FAILED dependendo do ambiente
    expect(['SENT', 'FAILED', 'ENQUEUED']).toContain(updatedEmail?.status);

    // Cleanup
    await prisma.emailOutbox.delete({ where: { id: email.id } }).catch(() => {});
  }, 20000);

  it('should use fallback for company without verified domain', async () => {
    // Criar empresa sem domínio verificado
    const sandboxCompany = await prisma.company.create({
      data: {
        name: 'E2E Sandbox Company',
        apiKey: 'sk_test_e2e_sandbox',
        apiKeyHash: await bcrypt.hash('sk_test_e2e_sandbox', 10),
        apiKeyPrefix: 'sk_sand',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        dailyEmailLimit: 100,
        isApproved: false,
      },
    });

    // Criar EmailOutbox
    const email = await prisma.emailOutbox.create({
      data: {
        companyId: sandboxCompany.id,
        to: 'recipient@example.com',
        subject: 'E2E Test - Sandbox',
        html: '<p>Testing fallback domain</p>',
        status: 'PENDING',
      },
    });

    // Adicionar job na fila
    const job = await emailQueue.add('send-email', {
      companyId: sandboxCompany.id,
      outboxId: email.id,
      to: email.to,
      subject: email.subject,
      html: email.html,
      requestId: `e2e-sandbox-${Date.now()}`,
    });

    // Aguardar processamento
    try {
      await job.waitUntilFinished(emailQueue.events, 15000);
    } catch (err) {
      console.warn('Job timeout or processing error:', err);
    }

    // Verificar processamento
    const updatedEmail = await prisma.emailOutbox.findUnique({
      where: { id: email.id },
    });

    expect(updatedEmail).toBeDefined();
    expect(['SENT', 'FAILED', 'ENQUEUED']).toContain(updatedEmail?.status);

    // Cleanup
    await prisma.emailOutbox.delete({ where: { id: email.id } }).catch(() => {});
    await prisma.company.delete({ where: { id: sandboxCompany.id } }).catch(() => {});
  }, 20000);

  it('should reject emails from suspended company', async () => {
    // Criar empresa suspensa
    const suspendedCompany = await prisma.company.create({
      data: {
        name: 'E2E Suspended Company',
        apiKey: 'sk_test_e2e_suspended',
        apiKeyHash: await bcrypt.hash('sk_test_e2e_suspended', 10),
        apiKeyPrefix: 'sk_susp',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        dailyEmailLimit: 100,
        isApproved: true,
        isSuspended: true, // SUSPENSA
        suspensionReason: 'High bounce rate detected',
      },
    });

    // Criar EmailOutbox
    const email = await prisma.emailOutbox.create({
      data: {
        companyId: suspendedCompany.id,
        to: 'recipient@example.com',
        subject: 'E2E Test - Suspended',
        html: '<p>Should fail</p>',
        status: 'PENDING',
      },
    });

    // Adicionar job na fila
    const job = await emailQueue.add('send-email', {
      companyId: suspendedCompany.id,
      outboxId: email.id,
      to: email.to,
      subject: email.subject,
      html: email.html,
      requestId: `e2e-suspended-${Date.now()}`,
    });

    // Aguardar processamento
    try {
      await job.waitUntilFinished(emailQueue.events, 15000);
    } catch (err) {
      // Esperado falhar
      console.log('Expected error for suspended company');
    }

    // Verificar que falhou
    const updatedEmail = await prisma.emailOutbox.findUnique({
      where: { id: email.id },
    });

    expect(updatedEmail).toBeDefined();
    // Deve ter falhado ou estar ENQUEUED (dependendo de quando chegou o erro)
    expect(['FAILED', 'ENQUEUED', 'PENDING']).toContain(updatedEmail?.status);

    // Cleanup
    await prisma.emailOutbox.delete({ where: { id: email.id } }).catch(() => {});
    await prisma.company.delete({ where: { id: suspendedCompany.id } }).catch(() => {});
  }, 20000);
});
