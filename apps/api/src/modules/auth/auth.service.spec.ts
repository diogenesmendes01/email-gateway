import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthService, ApiKeyPayload, RateLimitConfig } from './auth.service';
import { prisma } from '@email-gateway/database';
import * as bcrypt from 'bcrypt';

// Mock Prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    company: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateApiKey', () => {
    it('should generate API key with default prefix', async () => {
      const mockHash = 'hashed_api_key';
      (bcrypt.hash as jest.Mock).mockResolvedValue(mockHash);

      const result = await service.generateApiKey('company-123');

      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{64}$/);
      expect(result.hash).toBe(mockHash);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(bcrypt.hash).toHaveBeenCalledWith(expect.stringMatching(/^sk_live_[a-f0-9]{64}$/), 12);
    });

    it('should generate API key with custom prefix', async () => {
      const mockHash = 'hashed_api_key';
      (bcrypt.hash as jest.Mock).mockResolvedValue(mockHash);

      const result = await service.generateApiKey('company-123', 'sk_test');

      expect(result.apiKey).toMatch(/^sk_test_[a-f0-9]{64}$/);
      expect(result.hash).toBe(mockHash);
      expect(bcrypt.hash).toHaveBeenCalledWith(expect.stringMatching(/^sk_test_[a-f0-9]{64}$/), 12);
    });

    it('should set expiration date to 90 days from now', async () => {
      const mockHash = 'hashed_api_key';
      (bcrypt.hash as jest.Mock).mockResolvedValue(mockHash);

      const result = await service.generateApiKey('company-123');
      const expectedExpiration = new Date();
      expectedExpiration.setDate(expectedExpiration.getDate() + 90);

      // Allow 1 second tolerance for test execution time
      const timeDiff = Math.abs(result.expiresAt.getTime() - expectedExpiration.getTime());
      expect(timeDiff).toBeLessThan(1000);
    });
  });

  describe('validateApiKey', () => {
    it('should return payload for valid API key', async () => {
      const apiKey = 'sk_live_valid_key';
      const mockHash = 'hashed_key';
      const mockCompany = {
        id: 'company-123',
        name: 'Test Company',
        apiKeyHash: mockHash,
        apiKeyPrefix: 'sk_live',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 86400000), // 1 day from now
        lastUsedAt: null,
        isActive: true,
        allowedIps: ['192.168.1.1'],
        rateLimitConfig: { rps: 60, burst: 120, windowMs: 1000 },
      };

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);
      (prisma.company.update as jest.Mock).mockResolvedValue(mockCompany);

      const result = await service.validateApiKey(apiKey);

      expect(result).toEqual({
        companyId: 'company-123',
        prefix: 'sk_live',
        expiresAt: mockCompany.apiKeyExpiresAt,
        lastUsedAt: expect.any(Date),
        allowedIps: ['192.168.1.1'],
        rateLimitConfig: { rps: 60, burst: 120, windowMs: 1000 },
        isActive: true,
      });

      expect(bcrypt.compare).toHaveBeenCalledWith(apiKey, mockHash);
      expect(prisma.company.findUnique).toHaveBeenCalledWith({
        where: { apiKeyHash: mockHash },
      });
      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: 'company-123' },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it('should return null for invalid API key hash', async () => {
      const apiKey = 'sk_live_invalid_key';
      const mockHash = 'hashed_key';

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateApiKey(apiKey);

      expect(result).toBeNull();
      expect(bcrypt.compare).toHaveBeenCalledWith(apiKey, mockHash);
      expect(prisma.company.findUnique).not.toHaveBeenCalled();
    });

    it('should return null for expired API key', async () => {
      const apiKey = 'sk_live_expired_key';
      const mockHash = 'hashed_key';
      const mockCompany = {
        id: 'company-123',
        name: 'Test Company',
        apiKeyHash: mockHash,
        apiKeyPrefix: 'sk_live',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() - 86400000), // 1 day ago
        lastUsedAt: null,
        isActive: true,
        allowedIps: [],
        rateLimitConfig: null,
      };

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);

      const result = await service.validateApiKey(apiKey);

      expect(result).toBeNull();
    });

    it('should return null for inactive company', async () => {
      const apiKey = 'sk_live_inactive_key';
      const mockHash = 'hashed_key';
      const mockCompany = {
        id: 'company-123',
        name: 'Test Company',
        apiKeyHash: mockHash,
        apiKeyPrefix: 'sk_live',
        apiKeyCreatedAt: new Date(),
        apiKeyExpiresAt: new Date(Date.now() + 86400000),
        lastUsedAt: null,
        isActive: false, // Inactive company
        allowedIps: [],
        rateLimitConfig: null,
      };

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(mockCompany);

      const result = await service.validateApiKey(apiKey);

      expect(result).toBeNull();
    });

    it('should return null when company not found', async () => {
      const apiKey = 'sk_live_not_found_key';
      const mockHash = 'hashed_key';

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (prisma.company.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.validateApiKey(apiKey);

      expect(result).toBeNull();
    });
  });

  describe('validateBasicAuth', () => {
    it('should return true for valid credentials', async () => {
      const username = 'admin';
      const password = 'password123';
      const mockHash = 'hashed_password';

      (configService.get as jest.Mock).mockReturnValue(mockHash);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateBasicAuth(username, password);

      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith(password, mockHash);
    });

    it('should return false for invalid credentials', async () => {
      const username = 'admin';
      const password = 'wrong_password';
      const mockHash = 'hashed_password';

      (configService.get as jest.Mock).mockReturnValue(mockHash);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateBasicAuth(username, password);

      expect(result).toBe(false);
      expect(bcrypt.compare).toHaveBeenCalledWith(password, mockHash);
    });

    it('should return false when credentials not configured', async () => {
      const username = 'admin';
      const password = 'password123';

      (configService.get as jest.Mock).mockReturnValue(null);

      const result = await service.validateBasicAuth(username, password);

      expect(result).toBe(false);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });
});