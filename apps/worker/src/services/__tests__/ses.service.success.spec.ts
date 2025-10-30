import { EmailDriverService } from '../../services/email-driver.service';

const AWS_SES = 'AWS_SES';

jest.mock('@email-gateway/database', () => ({
  prisma: {
    company: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'c1',
        defaultFromAddress: null,
        defaultFromName: null,
        domainId: null,
        isSuspended: false,
        defaultDomain: null,
      }),
    },
  },
}), { virtual: true });

// Mock @aws-sdk/client-ses
jest.mock('@aws-sdk/client-ses', () => {
  return {
    SESClient: jest.fn().mockImplementation(() => ({
      send: jest.fn(async (command: any) => ({ MessageId: 'mid-123' })),
    })),
    SendEmailCommand: jest.fn().mockImplementation((args: any) => args),
  };
});

describe('EmailDriverService + SESDriver - sucesso', () => {
  it('deve retornar success com messageId', async () => {
    const svc = new EmailDriverService([
      {
        id: 'primary',
        config: {
          provider: AWS_SES as any,
          region: 'us-east-1',
          fromAddress: 'noreply@example.com',
        },
      },
    ]);

    const res = await svc.sendEmail(
      {
        companyId: 'c1',
        outboxId: 'o1',
        requestId: 'r1',
        to: 'a@b.com',
        subject: 's',
        recipient: { recipientId: 'x', email: 'a@b.com' },
        attempt: 1,
        cc: [],
        bcc: [],
      } as any,
      '<html/>'
    );
    expect(res.success).toBe(true);
    expect(res.messageId).toBe('mid-123');
  });
});


