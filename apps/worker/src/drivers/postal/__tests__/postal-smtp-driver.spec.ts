import { PostalSMTPDriver } from '../postal-smtp-driver';
import type { DriverConfig, DriverSendOptions } from '../../base/driver-config.types';
import type { EmailSendJobData } from '@email-gateway/shared';

const POSTAL_SMTP = 'POSTAL_SMTP';

const createTransportMock = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: (...args: any[]) => createTransportMock(...args),
}));

const defaultConfig: DriverConfig = {
  provider: POSTAL_SMTP as any,
  host: 'postal',
  port: 587,
  secure: false,
  auth: {
    user: 'user',
    pass: 'pass',
  },
  fromAddress: 'noreply@example.com',
};

const defaultJob: EmailSendJobData = {
  companyId: 'c1',
  outboxId: 'o1',
  requestId: 'r1',
  to: 'user@example.com',
  subject: 'Hello',
  htmlRef: 'ref1',
  recipient: { email: 'user@example.com', externalId: 'ext1' },
  attempt: 1,
  enqueuedAt: new Date().toISOString(),
};

const defaultOptions: DriverSendOptions = {
  htmlContent: '<p>Hello</p>',
};

describe('PostalSMTPDriver', () => {
  beforeEach(() => {
    createTransportMock.mockReset();
  });

  it('deve enviar email com sucesso', async () => {
    const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'postal-123' });
    createTransportMock.mockReturnValue({ sendMail: sendMailMock, verify: jest.fn() });

    const driver = new PostalSMTPDriver(defaultConfig);

    const result = await driver.sendEmail(defaultJob, defaultConfig, defaultOptions);

    expect(result.success).toBe(true);
    expect(result.provider).toBe(POSTAL_SMTP);
    expect(result.messageId).toBe('postal-123');
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it('deve retornar erro quando envio falhar', async () => {
    const sendMailMock = jest.fn().mockRejectedValue(new Error('SMTP error'));
    createTransportMock.mockReturnValue({ sendMail: sendMailMock, verify: jest.fn() });

    const driver = new PostalSMTPDriver(defaultConfig);

    const result = await driver.sendEmail(defaultJob, defaultConfig, defaultOptions);

    expect(result.success).toBe(false);
    expect(result.provider).toBe(POSTAL_SMTP);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('SMTP error');
  });
});
