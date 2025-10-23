import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../src/modules/auth/auth.service';
import { ApiKeyGuard } from '../../src/modules/auth/auth.guard';
import { BasicAuthGuard } from '../../src/modules/auth/basic-auth.guard';
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

describe('Auth Model MVP Performance Tests', () => {
  let authService: AuthService;
  let apiKeyGuard: ApiKeyGuard;
  let basicAuthGuard: BasicAuthGuard;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        ApiKeyGuard,
        BasicAuthGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    apiKeyGuard = module.get<ApiKeyGuard>(ApiKeyGuard);
    basicAuthGuard = module.get<BasicAuthGuard>(BasicAuthGuard);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('API Key Validation Performance', () => {
    const mockCompany = {
      id: 'company-123',
      apiKeyPrefix: 'sk_live',
      apiKeyHash: 'hashed-key',
      apiKeyExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lastUsedAt: null,
      allowedIps: ['127.0.0.1'],
      rateLimitConfig: { rps: 60, burst: 120, windowMs: 1000 },
      isActive: true,
    };

    beforeEach(() => {
      (prisma.company.findMany as jest.Mock).mockResolvedValue([mockCompany]);
      (prisma.company.update as jest.Mock).mockResolvedValue({});
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);
    });

    it('should validate API key within acceptable latency', async () => {
      const apiKey = 'sk_live_performance_test';
      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await authService.validateApiKey(apiKey);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      // Should be under 50ms per validation (requirement: < 250ms total API latency)
      expect(avgTime).toBeLessThan(50);
      console.log(`Average API key validation time: ${avgTime.toFixed(2)}ms`);
    });

    it('should handle concurrent API key validations', async () => {
      const apiKey = 'sk_live_concurrent_test';
      const concurrentRequests = 50;

      const startTime = Date.now();

      const promises = Array.from({ length: concurrentRequests }, () =>
        authService.validateApiKey(apiKey)
      );

      await Promise.all(promises);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should handle 50 concurrent requests within reasonable time
      expect(totalTime).toBeLessThan(1000); // 1 second
      console.log(`50 concurrent API key validations completed in: ${totalTime}ms`);
    });

    it('should maintain performance with multiple companies', async () => {
      const companies = Array.from({ length: 100 }, (_, i) => ({
        id: `company-${i}`,
        apiKeyPrefix: 'sk_live',
        apiKeyHash: 'hashed-key',
        apiKeyExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastUsedAt: null,
        allowedIps: ['127.0.0.1'],
        rateLimitConfig: { rps: 60, burst: 120, windowMs: 1000 },
        isActive: true,
      }));

      (prisma.company.findMany as jest.Mock).mockResolvedValue(companies);

      const apiKey = 'sk_live_multi_company_test';
      const iterations = 50;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await authService.validateApiKey(apiKey);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      // Performance should not degrade significantly with more companies
      expect(avgTime).toBeLessThan(100);
      console.log(`Average validation time with 100 companies: ${avgTime.toFixed(2)}ms`);
    });
  });

  describe('Basic Auth Performance', () => {
    beforeEach(() => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        switch (key) {
          case 'DASHBOARD_USERNAME':
            return 'admin';
          case 'DASHBOARD_PASSWORD_HASH':
            return bcrypt.hashSync('admin123', 12);
          case 'DASHBOARD_READONLY_USERNAME':
            return 'readonly';
          case 'DASHBOARD_READONLY_PASSWORD_HASH':
            return bcrypt.hashSync('readonly123', 12);
          default:
            return undefined;
        }
      });
    });

    it('should validate Basic Auth credentials within acceptable latency', async () => {
      const credentials = Buffer.from('admin:admin123').toString('base64');
      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const mockContext = {
          switchToHttp: () => ({
            getRequest: () => ({
              headers: {
                authorization: `Basic ${credentials}`,
              },
            }),
          }),
        } as any;

        await basicAuthGuard.canActivate(mockContext);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      // Should be under 20ms per validation
      expect(avgTime).toBeLessThan(20);
      console.log(`Average Basic Auth validation time: ${avgTime.toFixed(2)}ms`);
    });
  });

  describe('IP Allowlist Performance', () => {
    it('should validate IP allowlist efficiently', async () => {
      const companyId = 'company-123';
      const allowedIps = Array.from({ length: 1000 }, (_, i) => `192.168.1.${i % 254 + 1}`);
      
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        allowedIps,
      });

      const testIp = '192.168.1.100';
      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await authService.validateIpAllowlist(companyId, testIp);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      // Should be under 10ms per validation
      expect(avgTime).toBeLessThan(10);
      console.log(`Average IP allowlist validation time: ${avgTime.toFixed(2)}ms`);
    });

    it('should handle empty allowlist efficiently', async () => {
      const companyId = 'company-123';
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({
        allowedIps: [],
      });

      const testIp = '192.168.1.100';
      const iterations = 1000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await authService.validateIpAllowlist(companyId, testIp);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      // Should be very fast for empty allowlist
      expect(avgTime).toBeLessThan(5);
      console.log(`Average empty allowlist validation time: ${avgTime.toFixed(2)}ms`);
    });
  });

  describe('Hash Generation Performance', () => {
    it('should generate API key hashes efficiently', async () => {
      const iterations = 10; // Reduced due to bcrypt cost
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await authService.generateApiKey(`company-${i}`);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      // Should be under 200ms per generation (bcrypt with cost 12)
      expect(avgTime).toBeLessThan(200);
      console.log(`Average API key generation time: ${avgTime.toFixed(2)}ms`);
    });

    it('should generate Basic Auth hashes efficiently', async () => {
      const password = 'test-password';
      const iterations = 10; // Reduced due to bcrypt cost
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await authService.generateBasicAuthHash(`${password}-${i}`);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      // Should be under 200ms per generation (bcrypt with cost 12)
      expect(avgTime).toBeLessThan(200);
      console.log(`Average Basic Auth hash generation time: ${avgTime.toFixed(2)}ms`);
    });
  });

  describe('Audit Logging Performance', () => {
    beforeEach(() => {
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
    });

    it('should log audit events efficiently', async () => {
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

      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await authService.logAuditEvent({
          ...auditData,
          resourceId: `email-${i}`,
        });
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      // Should be under 20ms per audit log
      expect(avgTime).toBeLessThan(20);
      console.log(`Average audit logging time: ${avgTime.toFixed(2)}ms`);
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not leak memory during repeated validations', async () => {
      const apiKey = 'sk_live_memory_test';
      const mockCompany = {
        id: 'company-123',
        apiKeyPrefix: 'sk_live',
        apiKeyHash: 'hashed-key',
        apiKeyExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastUsedAt: null,
        allowedIps: ['127.0.0.1'],
        rateLimitConfig: { rps: 60, burst: 120, windowMs: 1000 },
        isActive: true,
      };

      (prisma.company.findMany as jest.Mock).mockResolvedValue([mockCompany]);
      (prisma.company.update as jest.Mock).mockResolvedValue({});
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);

      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        await authService.validateApiKey(apiKey);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
      console.log(`Memory increase after ${iterations} validations: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });
  });

  describe('Throughput Tests', () => {
    it('should handle expected MVP throughput', async () => {
      const apiKey = 'sk_live_throughput_test';
      const mockCompany = {
        id: 'company-123',
        apiKeyPrefix: 'sk_live',
        apiKeyHash: 'hashed-key',
        apiKeyExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastUsedAt: null,
        allowedIps: ['127.0.0.1'],
        rateLimitConfig: { rps: 60, burst: 120, windowMs: 1000 },
        isActive: true,
      };

      (prisma.company.findMany as jest.Mock).mockResolvedValue([mockCompany]);
      (prisma.company.update as jest.Mock).mockResolvedValue({});
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);

      // MVP requirement: 2,000 emails/hour = ~33 emails/minute
      const requestsPerMinute = 50; // Slightly higher than requirement
      const requestsPerSecond = Math.ceil(requestsPerMinute / 60);
      const testDurationSeconds = 10;

      const startTime = Date.now();
      const promises = [];

      for (let second = 0; second < testDurationSeconds; second++) {
        for (let req = 0; req < requestsPerSecond; req++) {
          promises.push(authService.validateApiKey(apiKey));
        }
      }

      await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete within reasonable time
      expect(totalTime).toBeLessThan(testDurationSeconds * 1000 + 1000); // 1 second buffer
      console.log(`Processed ${promises.length} requests in ${totalTime}ms`);
      console.log(`Throughput: ${(promises.length / (totalTime / 1000)).toFixed(2)} requests/second`);
    });
  });
});
