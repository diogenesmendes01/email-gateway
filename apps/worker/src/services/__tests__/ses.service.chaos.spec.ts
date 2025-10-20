import { SESService } from '../../services/ses.service';

describe('SESService Chaos Flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('deve simular 429 quando CHAOS_SES_429=true', async () => {
    process.env.CHAOS_SES_429 = 'true';

    const svc = new SESService({
      region: 'us-east-1',
      fromAddress: 'noreply@example.com',
    });

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
      '<html/>',
    );

    expect(res.success).toBe(false);
  });
});


