import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateApiKey', () => {
    it('should generate API key with correct format', async () => {
      const result = await service.generateApiKey('company-123', 'sk_live');
      
      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{64}$/);
      expect(result.hash).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
      
      // Check if expires in 90 days
      const expectedExpiry = new Date();
      expectedExpiry.setDate(expectedExpiry.getDate() + 90);
      const timeDiff = Math.abs(result.expiresAt.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });

    it('should generate API key with default prefix', async () => {
      const result = await service.generateApiKey('company-123');
      
      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{64}$/);
    });
  });

  describe('isApiKeyExpired', () => {
    it('should return true for expired key', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      
      expect(service.isApiKeyExpired(pastDate)).toBe(true);
    });

    it('should return false for valid key', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      
      expect(service.isApiKeyExpired(futureDate)).toBe(false);
    });
  });

  describe('isApiKeyNearExpiration', () => {
    it('should return true for key expiring in 7 days', () => {
      const nearExpiryDate = new Date();
      nearExpiryDate.setDate(nearExpiryDate.getDate() + 6);
      
      expect(service.isApiKeyNearExpiration(nearExpiryDate)).toBe(true);
    });

    it('should return false for key expiring in 30 days', () => {
      const farExpiryDate = new Date();
      farExpiryDate.setDate(farExpiryDate.getDate() + 30);
      
      expect(service.isApiKeyNearExpiration(farExpiryDate)).toBe(false);
    });
  });

  describe('generateBasicAuthHash', () => {
    it('should generate hash for password', async () => {
      const password = 'test-password-123';
      const hash = await service.generateBasicAuthHash(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt format
    });
  });

  describe('validateBasicAuth', () => {
    it('should validate correct password', async () => {
      const password = 'test-password-123';
      const hash = await service.generateBasicAuthHash(password);
      
      const isValid = await service.validateBasicAuth(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'test-password-123';
      const wrongPassword = 'wrong-password';
      const hash = await service.generateBasicAuthHash(password);
      
      const isValid = await service.validateBasicAuth(wrongPassword, hash);
      expect(isValid).toBe(false);
    });
  });

  describe('getRateLimitConfig', () => {
    it('should return default rate limit config', () => {
      const config = service.getRateLimitConfig('company-123');
      
      expect(config).toEqual({
        rps: 60,
        burst: 120,
        windowMs: 1000,
      });
    });
  });
});
