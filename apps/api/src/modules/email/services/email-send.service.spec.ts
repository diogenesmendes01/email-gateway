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
    },
    recipient: {
      upsert: jest.fn(),
    },
  },
}));

class MockQueueService {
  enqueueEmailJob = jest.fn(async (data: any) => data.outboxId);
}

describe('EmailSendService', () => {
  let service: EmailSendService;
  let queue: MockQueueService;

  beforeEach(() => {
    jest.resetAllMocks();
    queue = new MockQueueService();
    service = new EmailSendService(queue as any);
  });

  it('deve criar outbox, enfileirar job e atualizar status para ENQUEUED', async () => {
    // Arrange
    const companyId = '00000000-0000-0000-0000-000000000001';
    const outboxId = '11111111-1111-1111-1111-111111111111';
    const recipientId = '22222222-2222-2222-2222-222222222222';

    // emailOutbox.create devolve id gerado
    (prisma.emailOutbox.create as jest.Mock).mockResolvedValue({ id: outboxId });
    (prisma.recipient.upsert as jest.Mock).mockResolvedValue({ id: recipientId });
    (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue(null);

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
    (prisma.idempotencyKey.findUnique as jest.Mock).mockResolvedValue(null);
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


