import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { RateLimitGuard } from '../rate-limit.guard';
import { RedisService } from '../redis.service';
import { ApiKeyGuard } from '../auth.guard';
import { BasicAuthGuard } from '../basic-auth.guard';

describe('Performance Tests', () => {
  let authService: AuthService;
  let rateLimitGuard: RateLimitGuard;
  let redisService: RedisService;
  let apiKeyGuard: ApiKeyGuard;
  let basicAuthGuard: BasicAuthGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        RateLimitGuard,
        RedisService,
        ApiKeyGuard,
        BasicAuthGuard,
        {
          provide: 'ConfigService',
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    rateLimitGuard = module.get<RateLimitGuard>(RateLimitGuard);
    redisService = module.get<RedisService>(RedisService);
    apiKeyGuard = module.get<ApiKeyGuard>(ApiKeyGuard);
    basicAuthGuard = module.get<BasicAuthGuard>(BasicAuthGuard);
  });

  describe('API Key Validation Performance', () => {
    it('should validate API keys within acceptable time', async () => {
      const apiKey = 'sk_live_test_key';
      const iterations = 1000;
      const maxTimePerValidation = 10; // 10ms

      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        await authService.validateApiKey(apiKey);
      }
      
      const end = Date.now();
      const totalTime = end - start;
      const avgTimePerValidation = totalTime / iterations;

      expect(avgTimePerValidation).toBeLessThan(maxTimePerValidation);
      expect(totalTime).toBeLessThan(5000); // Total should be under 5 seconds
    });

    it('should handle concurrent API key validations efficiently', async () => {
      const apiKey = 'sk_live_test_key';
      const concurrentRequests = 100;
      const maxTime = 1000; // 1 second

      const start = Date.now();
      
      const promises = Array(concurrentRequests).fill(null).map(() =>
        authService.validateApiKey(apiKey)
      );
      
      await Promise.all(promises);
      
      const end = Date.now();
      const totalTime = end - start;

      expect(totalTime).toBeLessThan(maxTime);
    });

    it('should maintain performance with large number of companies', async () => {
      const companies = Array(1000).fill(null).map((_, i) => `company-${i}`);
      const maxTime = 2000; // 2 seconds

      const start = Date.now();
      
      for (const companyId of companies) {
        await authService.generateApiKey(companyId);
      }
      
      const end = Date.now();
      const totalTime = end - start;

      expect(totalTime).toBeLessThan(maxTime);
    });
  });

  describe('Rate Limiting Performance', () => {
    it('should process rate limit checks efficiently', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            companyId: 'company-123',
            headers: { 'x-request-id': 'req-123' },
          }),
          getResponse: () => ({ setHeader: jest.fn() }),
        }),
      };

      (redisService.incr as jest.Mock).mockResolvedValue(1);
      (redisService.expire as jest.Mock).mockResolvedValue(1);
      (redisService.ttl as jest.Mock).mockResolvedValue(60);
      (redisService.get as jest.Mock).mockResolvedValue('0');

      const iterations = 1000;
      const maxTimePerCheck = 5; // 5ms

      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        await rateLimitGuard.canActivate(mockContext as any);
      }
      
      const end = Date.now();
      const totalTime = end - start;
      const avgTimePerCheck = totalTime / iterations;

      expect(avgTimePerCheck).toBeLessThan(maxTimePerCheck);
    });

    it('should handle high-frequency rate limit checks', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            companyId: 'company-123',
            headers: { 'x-request-id': 'req-123' },
          }),
          getResponse: () => ({ setHeader: jest.fn() }),
        }),
      };

      (redisService.incr as jest.Mock).mockResolvedValue(1);
      (redisService.expire as jest.Mock).mockResolvedValue(1);
      (redisService.ttl as jest.Mock).mockResolvedValue(60);
      (redisService.get as jest.Mock).mockResolvedValue('0');

      const highFrequencyRequests = 10000;
      const maxTime = 5000; // 5 seconds

      const start = Date.now();
      
      const promises = Array(highFrequencyRequests).fill(null).map(() =>
        rateLimitGuard.canActivate(mockContext as any)
      );
      
      await Promise.all(promises);
      
      const end = Date.now();
      const totalTime = end - start;

      expect(totalTime).toBeLessThan(maxTime);
    });

    it('should maintain performance with multiple companies', async () => {
      const companies = Array(100).fill(null).map((_, i) => `company-${i}`);
      const maxTime = 3000; // 3 seconds

      (redisService.incr as jest.Mock).mockResolvedValue(1);
      (redisService.expire as jest.Mock).mockResolvedValue(1);
      (redisService.ttl as jest.Mock).mockResolvedValue(60);
      (redisService.get as jest.Mock).mockResolvedValue('0');

      const start = Date.now();
      
      for (const companyId of companies) {
        const mockContext = {
          switchToHttp: () => ({
            getRequest: () => ({
              companyId,
              headers: { 'x-request-id': 'req-123' },
            }),
            getResponse: () => ({ setHeader: jest.fn() }),
          }),
        };

        await rateLimitGuard.canActivate(mockContext as any);
      }
      
      const end = Date.now();
      const totalTime = end - start;

      expect(totalTime).toBeLessThan(maxTime);
    });
  });

  describe('Basic Auth Performance', () => {
    it('should validate Basic Auth credentials efficiently', async () => {
      const username = 'admin';
      const password = 'password123';
      const iterations = 1000;
      const maxTimePerValidation = 5; // 5ms

      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        await authService.validateBasicAuth(username, password);
      }
      
      const end = Date.now();
      const totalTime = end - start;
      const avgTimePerValidation = totalTime / iterations;

      expect(avgTimePerValidation).toBeLessThan(maxTimePerValidation);
    });

    it('should handle concurrent Basic Auth validations', async () => {
      const username = 'admin';
      const password = 'password123';
      const concurrentRequests = 100;
      const maxTime = 500; // 500ms

      const start = Date.now();
      
      const promises = Array(concurrentRequests).fill(null).map(() =>
        authService.validateBasicAuth(username, password)
      );
      
      await Promise.all(promises);
      
      const end = Date.now();
      const totalTime = end - start;

      expect(totalTime).toBeLessThan(maxTime);
    });
  });

  describe('Redis Performance', () => {
    it('should handle Redis operations efficiently', async () => {
      const key = 'test:key';
      const iterations = 1000;
      const maxTimePerOperation = 2; // 2ms

      (redisService.incr as jest.Mock).mockResolvedValue(1);
      (redisService.expire as jest.Mock).mockResolvedValue(1);
      (redisService.ttl as jest.Mock).mockResolvedValue(60);
      (redisService.get as jest.Mock).mockResolvedValue('0');

      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        await redisService.incr(key);
        await redisService.expire(key, 60);
        await redisService.ttl(key);
        await redisService.get(key);
      }
      
      const end = Date.now();
      const totalTime = end - start;
      const avgTimePerOperation = totalTime / (iterations * 4);

      expect(avgTimePerOperation).toBeLessThan(maxTimePerOperation);
    });

    it('should handle Redis connection failures gracefully', async () => {
      const key = 'test:key';
      const maxTime = 100; // 100ms

      (redisService.incr as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const start = Date.now();
      
      try {
        await redisService.incr(key);
      } catch (error) {
        // Expected to fail
      }
      
      const end = Date.now();
      const totalTime = end - start;

      expect(totalTime).toBeLessThan(maxTime);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during API key validation', async () => {
      const apiKey = 'sk_live_test_key';
      const iterations = 10000;

      const initialMemory = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < iterations; i++) {
        await authService.validateApiKey(apiKey);
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const maxMemoryIncrease = 50 * 1024 * 1024; // 50MB

      expect(memoryIncrease).toBeLessThan(maxMemoryIncrease);
    });

    it('should not leak memory during rate limiting', async () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            companyId: 'company-123',
            headers: { 'x-request-id': 'req-123' },
          }),
          getResponse: () => ({ setHeader: jest.fn() }),
        }),
      };

      (redisService.incr as jest.Mock).mockResolvedValue(1);
      (redisService.expire as jest.Mock).mockResolvedValue(1);
      (redisService.ttl as jest.Mock).mockResolvedValue(60);
      (redisService.get as jest.Mock).mockResolvedValue('0');

      const iterations = 10000;
      const initialMemory = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < iterations; i++) {
        await rateLimitGuard.canActivate(mockContext as any);
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const maxMemoryIncrease = 30 * 1024 * 1024; // 30MB

      expect(memoryIncrease).toBeLessThan(maxMemoryIncrease);
    });
  });

  describe('Scalability', () => {
    it('should scale with increasing number of companies', async () => {
      const companyCounts = [10, 50, 100, 500, 1000];
      const maxTimePerCompany = 5; // 5ms per company

      for (const count of companyCounts) {
        const companies = Array(count).fill(null).map((_, i) => `company-${i}`);
        
        const start = Date.now();
        
        for (const companyId of companies) {
          await authService.generateApiKey(companyId);
        }
        
        const end = Date.now();
        const totalTime = end - start;
        const avgTimePerCompany = totalTime / count;

        expect(avgTimePerCompany).toBeLessThan(maxTimePerCompany);
      }
    });

    it('should scale with increasing request frequency', async () => {
      const frequencies = [100, 500, 1000, 5000, 10000];
      const maxTimePerRequest = 2; // 2ms per request

      for (const frequency of frequencies) {
        const mockContext = {
          switchToHttp: () => ({
            getRequest: () => ({
              companyId: 'company-123',
              headers: { 'x-request-id': 'req-123' },
            }),
            getResponse: () => ({ setHeader: jest.fn() }),
          }),
        };

        (redisService.incr as jest.Mock).mockResolvedValue(1);
        (redisService.expire as jest.Mock).mockResolvedValue(1);
        (redisService.ttl as jest.Mock).mockResolvedValue(60);
        (redisService.get as jest.Mock).mockResolvedValue('0');

        const start = Date.now();
        
        for (let i = 0; i < frequency; i++) {
          await rateLimitGuard.canActivate(mockContext as any);
        }
        
        const end = Date.now();
        const totalTime = end - start;
        const avgTimePerRequest = totalTime / frequency;

        expect(avgTimePerRequest).toBeLessThan(maxTimePerRequest);
      }
    });
  });
});
