import { SESService } from '../ses.service';
import { prisma } from '@email-gateway/database';

// Mock Prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    company: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock AWS SDK
jest.mock('@aws-sdk/client-ses');

describe('SESService - Company Domain (TASK-027)', () => {
  let sesService: SESService;

  beforeEach(() => {
    sesService = new SESService({
      region: 'us-east-1',
      fromAddress: 'noreply@certshiftsoftware.com.br',
    });
  });

  it('should use company verified domain', async () => {
    // Mock company with verified domain
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      id: 'company-1',
      name: 'Test Company',
      defaultFromAddress: 'vendas@testcompany.com',
      defaultFromName: 'Equipe Vendas',
      domainId: 'domain-1',
      isSuspended: false,
      defaultDomain: {
        id: 'domain-1',
        domain: 'testcompany.com',
        status: 'VERIFIED',
      },
    });

    const jobData = {
      companyId: 'company-1',
      to: 'recipient@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      requestId: 'req-123',
      outboxId: 'out-123',
    } as any;

    // Mock SES response
    const mockSend = jest.fn().mockResolvedValue({
      MessageId: 'msg-123',
    });
    (sesService as any).client.send = mockSend;

    await sesService.sendEmail(jobData, '<p>Test</p>');

    // Verificar que usou domínio da empresa
    const sentCommand = mockSend.mock.calls[0][0];
    expect(sentCommand.input.Source).toBe('Equipe Vendas <vendas@testcompany.com>');
  });

  it('should use global fallback when domain not verified', async () => {
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      id: 'company-2',
      name: 'Test Company 2',
      defaultFromAddress: 'vendas@unverified.com',
      domainId: 'domain-2',
      isSuspended: false,
      defaultDomain: {
        id: 'domain-2',
        domain: 'unverified.com',
        status: 'PENDING', // Não verificado
      },
    });

    const mockSend = jest.fn().mockResolvedValue({ MessageId: 'msg-456' });
    (sesService as any).client.send = mockSend;

    await sesService.sendEmail({
      companyId: 'company-2',
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      requestId: 'req-456',
      outboxId: 'out-456',
    } as any, '<p>Test</p>');

    const sentCommand = mockSend.mock.calls[0][0];
    expect(sentCommand.input.Source).toBe('noreply@certshiftsoftware.com.br');
  });

  it('should throw error when company is suspended', async () => {
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      id: 'company-3',
      isSuspended: true,
    });

    await expect(
      sesService.sendEmail({
        companyId: 'company-3',
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        requestId: 'req-789',
        outboxId: 'out-789',
      } as any, '<p>Test</p>')
    ).rejects.toThrow('Company company-3 is suspended');
  });

  it('should use global fallback when no default domain', async () => {
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      id: 'company-4',
      name: 'Test Company 4',
      defaultFromAddress: null,
      domainId: null,
      isSuspended: false,
      defaultDomain: null,
    });

    const mockSend = jest.fn().mockResolvedValue({ MessageId: 'msg-789' });
    (sesService as any).client.send = mockSend;

    await sesService.sendEmail({
      companyId: 'company-4',
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      requestId: 'req-999',
      outboxId: 'out-999',
    } as any, '<p>Test</p>');

    const sentCommand = mockSend.mock.calls[0][0];
    expect(sentCommand.input.Source).toBe('noreply@certshiftsoftware.com.br');
  });

  it('should format source without name when defaultFromName is null', async () => {
    (prisma.company.findUnique as jest.Mock).mockResolvedValue({
      id: 'company-5',
      name: 'Test Company 5',
      defaultFromAddress: 'contact@company5.com',
      defaultFromName: null, // Sem nome
      domainId: 'domain-5',
      isSuspended: false,
      defaultDomain: {
        id: 'domain-5',
        domain: 'company5.com',
        status: 'VERIFIED',
      },
    });

    const mockSend = jest.fn().mockResolvedValue({ MessageId: 'msg-101' });
    (sesService as any).client.send = mockSend;

    await sesService.sendEmail({
      companyId: 'company-5',
      to: 'test@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      requestId: 'req-101',
      outboxId: 'out-101',
    } as any, '<p>Test</p>');

    const sentCommand = mockSend.mock.calls[0][0];
    expect(sentCommand.input.Source).toBe('contact@company5.com');
  });

  it('should throw error when company not found', async () => {
    (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      sesService.sendEmail({
        companyId: 'non-existent',
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        requestId: 'req-404',
        outboxId: 'out-404',
      } as any, '<p>Test</p>')
    ).rejects.toThrow('Company non-existent not found');
  });
});
