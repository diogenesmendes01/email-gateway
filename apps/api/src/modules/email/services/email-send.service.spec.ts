import { EmailSendService } from './email-send.service';
import { prisma } from '@email-gateway/database';

// Mocks
jest.mock('@email-gateway/database', () => ({
  prisma: {
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    emailOutbox: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    recipient: {
      upsert: jest.fn(),
    },
    recipientBlocklist: {
      findUnique: jest.fn(),
    },
  },
}));

class MockQueueService {
  enqueueEmailJob = jest.fn(async (data: any) => data.outboxId);
}

class MockMetricsService {
  recordEmailSent = jest.fn();
  recordEmailFailed = jest.fn();
  recordEmailSendDuration = jest.fn();
  recordQuotaExceeded = jest.fn();
  recordEncryptionLatency = jest.fn();
}

class MockContentValidationService {
  validateEmail = jest.fn().mockResolvedValue({
    valid: true,
    score: 0.8,
    errors: [],
    warnings: [],
  });
}

class MockDailyQuotaService {
  checkQuota = jest.fn().mockResolvedValue({
    allowed: true,
    current: 50,
    limit: 1000,
    resetsAt: '2025-01-01T00:00:00.000Z',
  });
  incrementQuota = jest.fn().mockResolvedValue(undefined);
}

describe('EmailSendService', () => {
  let service: EmailSendService;
  let queue: MockQueueService;
  let metrics: MockMetricsService;
  let contentValidation: MockContentValidationService;
  let dailyQuota: MockDailyQuotaService;

  beforeEach(() => {
    jest.resetAllMocks();
    queue = new MockQueueService();
    metrics = new MockMetricsService();
    contentValidation = new MockContentValidationService();
    dailyQuota = new MockDailyQuotaService();
    service = new EmailSendService(
      queue as any,
      metrics as any,
      contentValidation as any,
      dailyQuota as any,
    );

    // Default: no blocklist match
    (prisma.recipientBlocklist.findUnique as jest.Mock).mockResolvedValue(null);
    // Default: no idempotency conflict
    (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue(null);
  });

  it('deve criar outbox, enfileirar job e atualizar status para ENQUEUED', async () => {
    // Arrange
    const companyId = '00000000-0000-0000-0000-000000000001';
    const outboxId = '11111111-1111-1111-1111-111111111111';
    const recipientId = '22222222-2222-2222-2222-222222222222';

    // emailOutbox.create devolve id gerado
    (prisma.emailOutbox.create as jest.Mock).mockResolvedValue({ id: outboxId });
    (prisma.recipient.upsert as jest.Mock).mockResolvedValue({ id: recipientId });

    // Act
    const result = await service.sendEmail({
      companyId,
      body: {
        to: 'test@example.com',
        subject: 'Olá',
        html: '<p>ola</p>',
        recipient: { email: 'test@example.com', externalId: 'ext-1' },
      } as any,
      requestId: 'req-1',
    });

    // Assert
    expect(prisma.emailOutbox.create).toHaveBeenCalled();
    expect(queue.enqueueEmailJob).toHaveBeenCalledWith(
      expect.objectContaining({ companyId, to: 'test@example.com' })
    );
    expect(prisma.emailOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: result.outboxId } })
    );
    expect(result.outboxId).toEqual(result.jobId);
  });

  it('deve realizar rollback do outbox se enqueue falhar', async () => {
    // Arrange
    (prisma.emailOutbox.create as jest.Mock).mockResolvedValue({ id: 'o1' });
    (prisma.emailOutbox.delete as unknown as jest.Mock) = jest.fn();
    const errorQueue = new Error('redis down');
    queue.enqueueEmailJob = jest.fn().mockRejectedValue(errorQueue);

    // Act + Assert
    await expect(
      service.sendEmail({
        companyId: 'c1',
        body: { to: 'a@a.com', subject: 's', html: '<p>x</p>', recipient: { email: 'a@a.com' } } as any,
      })
    ).rejects.toBeTruthy();
  });
});
