import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainService } from '../domain.service';
import { prisma } from '@email-gateway/database';

// Mock prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    domain: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    company: {
      update: jest.fn(),
    },
  },
}));

// Mock DomainManagementService
jest.mock('../../../../../worker/src/services/domain-management.service', () => ({
  DomainManagementService: jest.fn().mockImplementation(() => ({
    verifyDomainStatus: jest.fn(),
  })),
}));

describe('DomainService - TASK-028', () => {
  let service: DomainService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'AWS_REGION') return 'us-east-1';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DomainService>(DomainService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('getDomainById', () => {
    it('should return domain details by ID', async () => {
      const mockDomain = {
        id: 'domain-123',
        companyId: 'company-123',
        domain: 'test.com',
        status: 'VERIFIED',
        dkimTokens: ['token1', 'token2'],
      };

      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(mockDomain);

      // Mock the domainManagementService
      const mockVerificationInfo = {
        status: 'VERIFIED',
        verificationToken: 'token123',
        dnsRecords: [],
        dkimTokens: ['token1', 'token2'],
        dkimStatus: 'SUCCESS',
        lastChecked: new Date(),
      };

      (service as any).domainManagementService.verifyDomainStatus = jest.fn()
        .mockResolvedValue(mockVerificationInfo);

      const result = await service.getDomainById('company-123', 'domain-123');

      expect(result.domain).toBe('test.com');
      expect(result.status).toBe('VERIFIED');
      expect(prisma.domain.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'domain-123',
          companyId: 'company-123',
        },
      });
    });

    it('should throw NotFoundException when domain not found', async () => {
      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getDomainById('company-123', 'non-existent')
      ).rejects.toThrow(NotFoundException);
    });

    it('should return cached data when SES query fails', async () => {
      const mockDomain = {
        id: 'domain-123',
        companyId: 'company-123',
        domain: 'test.com',
        status: 'PENDING',
        dkimTokens: [],
      };

      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(mockDomain);
      (service as any).domainManagementService.verifyDomainStatus = jest.fn()
        .mockRejectedValue(new Error('SES API error'));

      const result = await service.getDomainById('company-123', 'domain-123');

      expect(result.domain).toBe('test.com');
      expect(result.errorMessage).toContain('Failed to fetch latest status');
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
        defaultDomain: mockDomain,
      };

      (prisma.domain.findFirst as jest.Mock).mockResolvedValue(mockDomain);
      (prisma.company.update as jest.Mock).mockResolvedValue(mockUpdatedCompany);

      const result = await service.setDefaultDomain('company-123', 'domain-123');

      expect(result.success).toBe(true);
      expect(result.domain).toBe('verified.com');
      expect(result.defaultFromAddress).toBe('noreply@verified.com');
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-123' },
        data: {
          domainId: 'domain-123',
          defaultFromAddress: 'noreply@verified.com',
          defaultFromName: null,
        },
        include: {
          defaultDomain: true,
        },
      });
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
      (prisma.company.update as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await expect(
        service.setDefaultDomain('company-123', 'domain-123')
      ).rejects.toThrow(BadRequestException);
    });
  });
});
