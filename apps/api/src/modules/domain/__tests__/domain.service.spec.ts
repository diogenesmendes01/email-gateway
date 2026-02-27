import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DomainService } from '../domain.service';
import { prisma } from '@email-gateway/database';

// Mock prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    domain: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    dNSRecord: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    domainOnboarding: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    company: {
      update: jest.fn(),
    },
  },
}));

// Mock dns/promises
jest.mock('dns/promises', () => ({
  resolveTxt: jest.fn(),
  resolveCname: jest.fn(),
  resolveMx: jest.fn(),
}));

describe('DomainService', () => {
  let service: DomainService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [DomainService],
    }).compile();

    service = module.get<DomainService>(DomainService);
  });

  describe('getDomainById', () => {
    it('should return domain details by ID', async () => {
      const mockDomain = {
        id: 'domain-123',
        companyId: 'company-123',
        domain: 'test.com',
        status: 'VERIFIED',
        dkimStatus: 'VERIFIED',
        dkimTokens: ['token1'],
        lastChecked: new Date(),
        errorMessage: null,
      };

      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(mockDomain);
      (prisma.dNSRecord.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getDomainById('company-123', 'domain-123');

      expect(result.domain).toBe('test.com');
      expect(result.status).toBe('Success');
      expect(prisma.domain.findFirst).toHaveBeenCalledWith({
        where: { id: 'domain-123', companyId: 'company-123' },
      });
    });

    it('should throw NotFoundException when domain not found', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getDomainById('company-123', 'non-existent')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('setDefaultDomain', () => {
    it('should set domain as default when verified', async () => {
      const mockDomain = {
        id: 'domain-123',
        companyId: 'company-123',
        domain: 'verified.com',
        status: 'VERIFIED',
      };

      const mockUpdatedCompany = {
        id: 'company-123',
        domainId: 'domain-123',
        defaultFromAddress: 'noreply@verified.com',
        defaultFromName: null,
      };

      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(mockDomain);
      (prisma.company.update as jest.Mock).mockResolvedValue(mockUpdatedCompany);

      const result = await service.setDefaultDomain('company-123', 'domain-123');

      expect(result.success).toBe(true);
      expect(result.domain).toBe('verified.com');
      expect(result.defaultFromAddress).toBe('noreply@verified.com');
    });

    it('should throw NotFoundException when domain not found', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.setDefaultDomain('company-123', 'non-existent')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when domain not verified', async () => {
      const mockDomain = {
        id: 'domain-123',
        companyId: 'company-123',
        domain: 'pending.com',
        status: 'PENDING',
      };

      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(mockDomain);

      await expect(
        service.setDefaultDomain('company-123', 'domain-123')
      ).rejects.toThrow(BadRequestException);
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when update fails', async () => {
      const mockDomain = {
        id: 'domain-123',
        companyId: 'company-123',
        domain: 'verified.com',
        status: 'VERIFIED',
      };

      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(mockDomain);
      (prisma.company.update as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(
        service.setDefaultDomain('company-123', 'domain-123')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listDomains', () => {
    it('should return list of domains', async () => {
      (prisma.domain.findMany as jest.Mock).mockResolvedValue([
        {
          domain: 'test.com',
          status: 'VERIFIED',
          dkimStatus: 'VERIFIED',
          dkimTokens: [],
          lastChecked: null,
          errorMessage: null,
        },
        {
          domain: 'pending.com',
          status: 'PENDING',
          dkimStatus: 'PENDING',
          dkimTokens: [],
          lastChecked: null,
          errorMessage: null,
        },
      ]);

      const result = await service.listDomains('company-123');

      expect(result.total).toBe(2);
      expect(result.verified).toBe(1);
      expect(result.pending).toBe(1);
    });
  });

  describe('addDomain', () => {
    it('should reject invalid domain format', async () => {
      await expect(
        service.addDomain('company-123', { domain: 'not valid!' })
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate domain', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue({ id: 'existing' });

      await expect(
        service.addDomain('company-123', { domain: 'test.com' })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeDomain', () => {
    it('should throw NotFoundException when domain not found', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.removeDomain('company-123', 'nonexistent.com')
      ).rejects.toThrow(NotFoundException);
    });

    it('should delete domain successfully', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue({ id: 'domain-123' });
      (prisma.domain.delete as jest.Mock).mockResolvedValue({});

      await expect(
        service.removeDomain('company-123', 'test.com')
      ).resolves.toBeUndefined();
    });
  });
});
