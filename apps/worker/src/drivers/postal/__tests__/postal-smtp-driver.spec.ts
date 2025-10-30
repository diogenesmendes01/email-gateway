import { PostalSMTPDriver } from '../postal-smtp-driver';
import type { DriverSendRequest } from '../../base/email-driver.interface';

const POSTAL_SMTP = 'POSTAL_SMTP';

const createTransportMock = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: (...args: any[]) => createTransportMock(...args),
}));

describe('PostalSMTPDriver', () => {
  beforeEach(() => {
    createTransportMock.mockReset();
  });

  it('deve enviar email com sucesso', async () => {
    const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'postal-123' });
    createTransportMock.mockReturnValue({ sendMail: sendMailMock, verify: jest.fn() });

    const driver = new PostalSMTPDriver({
      provider: POSTAL_SMTP as any,
      host: 'postal',
      port: 587,
      secure: false,
      auth: {
        user: 'user',
        pass: 'pass',
      },
      fromAddress: 'noreply@example.com',
    });

    const request: DriverSendRequest = {
      job: {
        companyId: 'c1',
        outboxId: 'o1',
        requestId: 'r1',
        to: 'user@example.com',
        subject: 'Hello',
        attempt: 1,
      } as any,
      htmlContent: '<p>Hello</p>',
    };

    const result = await driver.sendEmail(request);

    expect(result.success).toBe(true);
    expect(result.provider).toBe(POSTAL_SMTP);
    expect(result.messageId).toBe('postal-123');
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });

  it('deve retornar erro quando envio falhar', async () => {
    const sendMailMock = jest.fn().mockRejectedValue(new Error('SMTP error'));
    createTransportMock.mockReturnValue({ sendMail: sendMailMock, verify: jest.fn() });

    const driver = new PostalSMTPDriver({
      provider: POSTAL_SMTP as any,
      host: 'postal',
      port: 587,
      secure: false,
      auth: {
        user: 'user',
        pass: 'pass',
      },
      fromAddress: 'noreply@example.com',
    });

    const request: DriverSendRequest = {
      job: {
        companyId: 'c1',
        outboxId: 'o1',
        requestId: 'r1',
        to: 'user@example.com',
        subject: 'Hello',
        attempt: 1,
      } as any,
      htmlContent: '<p>Hello</p>',
    };

    const result = await driver.sendEmail(request);

    expect(result.success).toBe(false);
    expect(result.provider).toBe(POSTAL_SMTP);
    expect(result.error?.message).toContain('SMTP error');
  });
});

