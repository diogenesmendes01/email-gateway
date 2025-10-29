/**
 * @email-gateway/api - Profile Controller Tests
 *
 * TASK-037: Tests for company profile management endpoints
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ProfileController } from '../profile.controller';
import { CompanyService } from '../../services/company.service';
import { ApiKeyGuard } from '../../../auth/auth.guard';
import { AuditInterceptor } from '../../../auth/audit.interceptor';

// Mock CompanyService
const mockCompanyService = {
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  regenerateApiKey: jest.fn(),
};

// Mock guard to bypass authentication in tests
const mockGuard = {
  canActivate: jest.fn(() => true),
};

describe('ProfileController - TASK-037', () => {
  let controller: ProfileController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        {
          provide: CompanyService,
          useValue: mockCompanyService,
        },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue(mockGuard)
      .overrideInterceptor(AuditInterceptor)
      .useValue({ intercept: (context: any, next: any) => next.handle() })
      .compile();

    controller = module.get<ProfileController>(ProfileController);

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should return company profile successfully', async () => {
      const companyId = 'company-123';
      const mockProfile = {
        id: companyId,
        name: 'Test Company',
        email: 'test@company.com',
        status: {
          isApproved: false,
          isActive: true,
          isSuspended: false,
          approvedAt: null,
          suspensionReason: null,
        },
        limits: {
          dailyEmailLimit: 100,
          monthlyEmailLimit: 3000,
          emailsSentToday: 45,
          emailsSentThisMonth: 823,
        },
        metrics: {
          bounceRate: 0.8,
          complaintRate: 0.02,
          totalEmailsSent: 1520,
          lastMetricsUpdate: new Date(),
        },
        config: {
          defaultFromAddress: 'noreply@company.com',
          defaultFromName: 'Test Company',
          domainId: null,
        },
        apiKey: {
          prefix: 'ek_live_abc1...',
          createdAt: new Date(),
          expiresAt: new Date(),
          lastUsedAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCompanyService.getProfile.mockResolvedValue(mockProfile);

      const result = await controller.getProfile(companyId);

      expect(result).toEqual(mockProfile);
      expect(mockCompanyService.getProfile).toHaveBeenCalledWith(companyId);
      expect(mockCompanyService.getProfile).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when company not found', async () => {
      const companyId = 'non-existent';

      mockCompanyService.getProfile.mockRejectedValue(
        new NotFoundException('Empresa não encontrada')
      );

      await expect(controller.getProfile(companyId)).rejects.toThrow(
        NotFoundException
      );

      expect(mockCompanyService.getProfile).toHaveBeenCalledWith(companyId);
    });
  });

  describe('updateProfile', () => {
    it('should update company profile successfully', async () => {
      const companyId = 'company-123';
      const updateDto = {
        name: 'Updated Company Name',
        defaultFromAddress: 'new@company.com',
        defaultFromName: 'Updated Name',
      };

      const mockUpdatedProfile = {
        id: companyId,
        name: updateDto.name,
        email: 'test@company.com',
        status: {
          isApproved: false,
          isActive: true,
          isSuspended: false,
          approvedAt: null,
          suspensionReason: null,
        },
        limits: {
          dailyEmailLimit: 100,
          monthlyEmailLimit: 3000,
          emailsSentToday: 45,
          emailsSentThisMonth: 823,
        },
        metrics: {
          bounceRate: 0.8,
          complaintRate: 0.02,
          totalEmailsSent: 1520,
          lastMetricsUpdate: new Date(),
        },
        config: {
          defaultFromAddress: updateDto.defaultFromAddress,
          defaultFromName: updateDto.defaultFromName,
          domainId: null,
        },
        apiKey: {
          prefix: 'ek_live_abc1...',
          createdAt: new Date(),
          expiresAt: new Date(),
          lastUsedAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCompanyService.updateProfile.mockResolvedValue(mockUpdatedProfile);

      const result = await controller.updateProfile(companyId, updateDto);

      expect(result).toEqual(mockUpdatedProfile);
      expect(mockCompanyService.updateProfile).toHaveBeenCalledWith(
        companyId,
        updateDto
      );
      expect(mockCompanyService.updateProfile).toHaveBeenCalledTimes(1);
    });

    it('should update profile with partial data', async () => {
      const companyId = 'company-123';
      const updateDto = {
        name: 'Updated Name Only',
      };

      const mockUpdatedProfile = {
        id: companyId,
        name: updateDto.name,
        email: 'test@company.com',
        status: {
          isApproved: false,
          isActive: true,
          isSuspended: false,
          approvedAt: null,
          suspensionReason: null,
        },
        limits: {
          dailyEmailLimit: 100,
          monthlyEmailLimit: 3000,
          emailsSentToday: 45,
          emailsSentThisMonth: 823,
        },
        metrics: {
          bounceRate: 0.8,
          complaintRate: 0.02,
          totalEmailsSent: 1520,
          lastMetricsUpdate: new Date(),
        },
        config: {
          defaultFromAddress: 'old@company.com',
          defaultFromName: 'Old Name',
          domainId: null,
        },
        apiKey: {
          prefix: 'ek_live_abc1...',
          createdAt: new Date(),
          expiresAt: new Date(),
          lastUsedAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCompanyService.updateProfile.mockResolvedValue(mockUpdatedProfile);

      const result = await controller.updateProfile(companyId, updateDto);

      expect(result).toEqual(mockUpdatedProfile);
      expect(mockCompanyService.updateProfile).toHaveBeenCalledWith(
        companyId,
        updateDto
      );
    });

    it('should throw NotFoundException when company not found', async () => {
      const companyId = 'non-existent';
      const updateDto = {
        name: 'New Name',
      };

      mockCompanyService.updateProfile.mockRejectedValue(
        new NotFoundException('Empresa não encontrada')
      );

      await expect(
        controller.updateProfile(companyId, updateDto)
      ).rejects.toThrow(NotFoundException);

      expect(mockCompanyService.updateProfile).toHaveBeenCalledWith(
        companyId,
        updateDto
      );
    });
  });

  describe('regenerateApiKey', () => {
    it('should regenerate API key successfully', async () => {
      const companyId = 'company-123';
      const regenerateDto = {
        currentPassword: 'correct-password',
      };

      const mockResponse = {
        apiKey: 'ek_live_newapikey1234567890abcdef',
        apiKeyPrefix: 'ek_live_newa...',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        message:
          'API Key regenerada com sucesso! Guarde em local seguro - não será mostrada novamente. A API Key anterior foi invalidada.',
      };

      mockCompanyService.regenerateApiKey.mockResolvedValue(mockResponse);

      const result = await controller.regenerateApiKey(companyId, regenerateDto);

      expect(result).toEqual(mockResponse);
      expect(mockCompanyService.regenerateApiKey).toHaveBeenCalledWith(
        companyId,
        regenerateDto
      );
      expect(mockCompanyService.regenerateApiKey).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException when password is incorrect', async () => {
      const companyId = 'company-123';
      const regenerateDto = {
        currentPassword: 'wrong-password',
      };

      mockCompanyService.regenerateApiKey.mockRejectedValue(
        new UnauthorizedException('Senha incorreta')
      );

      await expect(
        controller.regenerateApiKey(companyId, regenerateDto)
      ).rejects.toThrow(UnauthorizedException);

      expect(mockCompanyService.regenerateApiKey).toHaveBeenCalledWith(
        companyId,
        regenerateDto
      );
    });

    it('should throw NotFoundException when company not found', async () => {
      const companyId = 'non-existent';
      const regenerateDto = {
        currentPassword: 'password',
      };

      mockCompanyService.regenerateApiKey.mockRejectedValue(
        new NotFoundException('Empresa não encontrada')
      );

      await expect(
        controller.regenerateApiKey(companyId, regenerateDto)
      ).rejects.toThrow(NotFoundException);

      expect(mockCompanyService.regenerateApiKey).toHaveBeenCalledWith(
        companyId,
        regenerateDto
      );
    });

    it('should return new API key with correct expiration date', async () => {
      const companyId = 'company-123';
      const regenerateDto = {
        currentPassword: 'correct-password',
      };

      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const mockResponse = {
        apiKey: 'ek_live_brandnewkey1234567890abcdef',
        apiKeyPrefix: 'ek_live_brand...',
        expiresAt,
        message:
          'API Key regenerada com sucesso! Guarde em local seguro - não será mostrada novamente. A API Key anterior foi invalidada.',
      };

      mockCompanyService.regenerateApiKey.mockResolvedValue(mockResponse);

      const result = await controller.regenerateApiKey(companyId, regenerateDto);

      expect(result.apiKey).toBe(mockResponse.apiKey);
      expect(result.apiKeyPrefix).toBe(mockResponse.apiKeyPrefix);
      expect(result.expiresAt).toEqual(expiresAt);
      expect(result.message).toContain('API Key regenerada com sucesso');
    });
  });
});
