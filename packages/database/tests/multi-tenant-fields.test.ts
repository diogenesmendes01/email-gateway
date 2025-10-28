import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

describe('TASK-026: Multi-tenant fields', () => {
  afterAll(async () => {
    // Clean up test data
    await prisma.company.deleteMany({
      where: {
        name: {
          in: ['Test Company Multi-Tenant', 'Test Company 2 Multi-Tenant'],
        },
      },
    });
    await prisma.$disconnect();
  });

  it('should create company with multi-tenant fields', async () => {
    const company = await prisma.company.create({
      data: {
        name: 'Test Company Multi-Tenant',
        apiKey: 'sk_test_mt_123',
        apiKeyHash: await bcrypt.hash('sk_test_mt_123', 10),
        apiKeyPrefix: 'sk_test',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),

        // Multi-tenant fields
        dailyEmailLimit: 5000,
        isApproved: true,
        bounceRate: 1.2,
        complaintRate: 0.05,
      },
    });

    expect(company.dailyEmailLimit).toBe(5000);
    expect(company.isApproved).toBe(true);
    expect(company.isSuspended).toBe(false);
    expect(company.bounceRate).toBe(1.2);
    expect(company.complaintRate).toBe(0.05);
  });

  it('should create company with default domain', async () => {
    const company = await prisma.company.create({
      data: {
        name: 'Test Company 2 Multi-Tenant',
        apiKey: 'sk_test_mt_456',
        apiKeyHash: await bcrypt.hash('sk_test_mt_456', 10),
        apiKeyPrefix: 'sk_test',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        domains: {
          create: {
            domain: 'example-mt.com',
            status: 'VERIFIED',
            dkimStatus: 'VERIFIED',
          },
        },
      },
      include: {
        domains: true,
      },
    });

    // Set first domain as default
    const updatedCompany = await prisma.company.update({
      where: { id: company.id },
      data: {
        domainId: company.domains[0].id,
        defaultFromAddress: 'vendas@example-mt.com',
        defaultFromName: 'Vendas',
      },
      include: {
        defaultDomain: true,
      },
    });

    expect(updatedCompany.defaultFromAddress).toBe('vendas@example-mt.com');
    expect(updatedCompany.defaultFromName).toBe('Vendas');
    expect(updatedCompany.defaultDomain?.domain).toBe('example-mt.com');
  });

  it('should query companies by approval status', async () => {
    const unapproved = await prisma.company.findMany({
      where: {
        isApproved: false,
        isSuspended: false,
      },
    });

    expect(Array.isArray(unapproved)).toBe(true);
  });

  it('should query companies by bounce rate', async () => {
    const highBounce = await prisma.company.findMany({
      where: {
        bounceRate: {
          gt: 5.0, // > 5%
        },
      },
    });

    expect(Array.isArray(highBounce)).toBe(true);
  });

  it('should have default values for new companies', async () => {
    const company = await prisma.company.create({
      data: {
        name: 'Test Company Defaults',
        apiKey: 'sk_test_defaults_789',
        apiKeyHash: await bcrypt.hash('sk_test_defaults_789', 10),
        apiKeyPrefix: 'sk_def',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });

    expect(company.dailyEmailLimit).toBe(1000); // Default value
    expect(company.isApproved).toBe(false); // Default value
    expect(company.isSuspended).toBe(false); // Default value
    expect(company.bounceRate).toBe(0); // Default value
    expect(company.complaintRate).toBe(0); // Default value

    // Clean up
    await prisma.company.delete({ where: { id: company.id } });
  });

  it('should allow suspended companies with reason', async () => {
    const company = await prisma.company.create({
      data: {
        name: 'Test Company Suspended',
        apiKey: 'sk_test_suspended_999',
        apiKeyHash: await bcrypt.hash('sk_test_suspended_999', 10),
        apiKeyPrefix: 'sk_sus',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        isSuspended: true,
        suspensionReason: 'High bounce rate detected',
        bounceRate: 7.5,
      },
    });

    expect(company.isSuspended).toBe(true);
    expect(company.suspensionReason).toBe('High bounce rate detected');
    expect(company.bounceRate).toBe(7.5);

    // Clean up
    await prisma.company.delete({ where: { id: company.id } });
  });
});
