import { SESService } from '../../services/ses.service';

// Mock @aws-sdk/client-ses
jest.mock('@aws-sdk/client-ses', () => {
  return {
    SESClient: jest.fn().mockImplementation(() => ({
      send: jest.fn(async (command: any) => ({ MessageId: 'mid-123' })),
    })),
    SendEmailCommand: jest.fn().mockImplementation((args: any) => args),
  };
});

describe('SESService - sucesso', () => {
  it('deve retornar success com messageId', async () => {
    const svc = new SESService({ region: 'us-east-1', fromAddress: 'noreply@example.com' });
    const res = await svc.sendEmail(
      {
        companyId: 'c1',
        outboxId: 'o1',
        requestId: 'r1',
        to: 'a@b.com',
        subject: 's',
        recipient: { recipientId: 'x', email: 'a@b.com' },
        attempt: 1,
      } as any,
      '<html/>'
    );
    expect(res.success).toBe(true);
    expect(res.messageId).toBe('mid-123');
  });
});


