import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService, ApiKeyPayload, RateLimitConfig } from '../../src/modules/auth/auth.service';
import { ApiKeyGuard } from '../../src/modules/auth/auth.guard';
import { prisma } from '@email-gateway/database';
import * as bcrypt from 'bcrypt';

// Mock do Prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    company: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe('AuthService', () => {
  let service: AuthService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateApiKey', () => {
    it('should generate a valid API key with prefix', async () => {
      const companyId = 'company-123';
      const prefix = 'sk_live';

      const result = await service.generateApiKey(companyId, prefix);

      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{64}$/);
      expect(result.hash).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should generate API key with default prefix', async () => {
      const companyId = 'company-123';

      const result = await service.generateApiKey(companyId);

      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{64}$/);
    });

    it('should set expiration to 90 days from now', async () => {
      const companyId = 'company-123';
      const now = new Date();
      const expectedExpiration = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      const result = await service.generateApiKey(companyId);

      const timeDiff = Math.abs(result.expiresAt.getTime() - expectedExpiration.getTime());
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });
  });

  describe('validateApiKey', () => {
    const mockCompany = {
      id: 'company-123',
      apiKeyPrefix: 'sk_live',
      apiKeyHash: 'hashed-key',
      apiKeyExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      lastUsedAt: null,
      allowedIps: ['192.168.1.1'],
      rateLimitConfig: { rps: 60, burst: 120, windowMs: 1000 },
      isActive: true,
    };

    beforeEach(() => {
      (prisma.company.findMany as jest.Mock).mockResolvedValue([mockCompany]);
      (prisma.company.update as jest.Mock).mockResolvedValue({});
    });

    it('should validate correct API key', async () => {
      const apiKey = 'sk_live_abc123def456';
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);

      const result = await service.validateApiKey(apiKey);

      expect(result).toEqual({
        companyId: 'company-123',
        prefix: 'sk_live',
        expiresAt: mockCompany.apiKeyExpiresAt,
        lastUsedAt: undefined,
        allowedIps: ['192.168.1.1'],
        rateLimitConfig: { rps: 60, burst: 120, windowMs: 1000 },
        isActive: true,
      });
    });

    it('should throw UnauthorizedException for invalid API key', async () => {
      const apiKey = 'sk_live_invalid';
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as any);

      await expect(service.validateApiKey(apiKey)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for expired API key', async () => {
      const apiKey = 'sk_live_abc123def456';
      const expiredCompany = {
        ...mockCompany,
        apiKeyExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      };
      (prisma.company.findMany as jest.Mock).mockResolvedValue([expiredCompany]);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);

      await expect(service.validateApiKey(apiKey)).rejects.toThrow(UnauthorizedException);
    });

    it('should return null for non-existent company', async () => {
      const apiKey = 'sk_live_abc123def456';
      (prisma.company.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.validateApiKey(apiKey);

      expect(result).toBeNull();
    });

    it('should update lastUsedAt when validating API key', async () => {
      const apiKey = 'sk_live_abc123def456';
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);

      await service.validateApiKey(apiKey);

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-123' },
        data: { lastUsedAt: expect.any(Date) },
      });
    });
  });

  describe('validateIpAllowlist', () => {
    it('should allow IP when in allowlist', async () => {
      const companyId = 'company-123';
      const clientIp = '192.168.1.1';
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        allowedIps: ['192.168.1.1', '10.0.0.1'],
      });

      const result = await service.validateIpAllowlist(companyId, clientIp);

      expect(result).toBe(true);
    });

    it('should deny IP when not in allowlist', async () => {
      const companyId = 'company-123';
      const clientIp = '192.168.1.100';
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        allowedIps: ['192.168.1.1', '10.0.0.1'],
      });

      const result = await service.validateIpAllowlist(companyId, clientIp);

      expect(result).toBe(false);
    });

    it('should allow all IPs when allowlist is empty', async () => {
      const companyId = 'company-123';
      const clientIp = '192.168.1.100';
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        allowedIps: [],
      });

      const result = await service.validateIpAllowlist(companyId, clientIp);

      expect(result).toBe(true);
    });

    it('should allow all IPs when allowlist is null', async () => {
      const companyId = 'company-123';
      const clientIp = '192.168.1.100';
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        allowedIps: null,
      });

      const result = await service.validateIpAllowlist(companyId, clientIp);

      expect(result).toBe(true);
    });

    it('should return false for non-existent company', async () => {
      const companyId = 'non-existent';
      const clientIp = '192.168.1.1';
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.validateIpAllowlist(companyId, clientIp);

      expect(result).toBe(false);
    });
  });

  describe('isApiKeyExpired', () => {
    it('should return true for expired date', () => {
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago

      const result = service.isApiKeyExpired(expiredDate);

      expect(result).toBe(true);
    });

    it('should return false for future date', () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day from now

      const result = service.isApiKeyExpired(futureDate);

      expect(result).toBe(false);
    });
  });

  describe('isApiKeyNearExpiration', () => {
    it('should return true when expiring within 7 days', () => {
      const nearExpirationDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

      const result = service.isApiKeyNearExpiration(nearExpirationDate);

      expect(result).toBe(true);
    });

    it('should return false when expiring after 7 days', () => {
      const farExpirationDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days from now

      const result = service.isApiKeyNearExpiration(farExpirationDate);

      expect(result).toBe(false);
    });
  });

  describe('generateBasicAuthHash', () => {
    it('should generate a valid bcrypt hash', async () => {
      const password = 'test-password';

      const hash = await service.generateBasicAuthHash(password);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(50); // bcrypt hash length
    });

    it('should generate different hashes for same password', async () => {
      const password = 'test-password';

      const hash1 = await service.generateBasicAuthHash(password);
      const hash2 = await service.generateBasicAuthHash(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validateBasicAuth', () => {
    it('should validate correct password', async () => {
      const password = 'test-password';
      const hash = await bcrypt.hash(password, 12);

      const result = await service.validateBasicAuth(password, hash);

      expect(result).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'test-password';
      const wrongPassword = 'wrong-password';
      const hash = await bcrypt.hash(password, 12);

      const result = await service.validateBasicAuth(wrongPassword, hash);

      expect(result).toBe(false);
    });
  });

  describe('logAuditEvent', () => {
    it('should create audit log entry', async () => {
      const auditData = {
        companyId: 'company-123',
        userId: 'user-456',
        action: 'EMAIL_SENT',
        resource: 'email',
        resourceId: 'email-789',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        metadata: { recipient: 'test@example.com' },
      };

      await service.logAuditEvent(auditData);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: auditData,
      });
    });
  });

  describe('getRateLimitConfig', () => {
    it('should return default rate limit configuration', () => {
      const companyId = 'company-123';

      const config = service.getRateLimitConfig(companyId);

      expect(config).toEqual({
        rps: 60,
        burst: 120,
        windowMs: 1000,
      });
    });
  });
});
