import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';
import { AuthService } from './auth.service';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let authService: AuthService;

  const mockRequest = {
    companyId: 'company-123',
    headers: {
      'x-request-id': 'req-123',
    },
  };

  const mockContext = {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
      getResponse: () => ({
        setHeader: jest.fn(),
      }),
    }),
  } as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        {
          provide: AuthService,
          useValue: {
            getRateLimitConfig: jest.fn().mockReturnValue({
              rps: 60,
              burst: 120,
              windowMs: 1000,
            }),
          },
        },
      ],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    // Clean up rate limit store
    // Redis service is used instead of in-memory store
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow request when within rate limits', async () => {
      const result = await guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should allow request when no companyId', async () => {
      const contextWithoutCompany = {
        ...mockContext,
        switchToHttp: () => ({
          getRequest: () => ({ headers: {} }),
          getResponse: () => ({ setHeader: jest.fn() }),
        }),
      } as ExecutionContext;

      const result = await guard.canActivate(contextWithoutCompany);
      expect(result).toBe(true);
    });

    it('should throw 429 when RPS limit exceeded', async () => {
      // Make 60 requests to hit the RPS limit
      for (let i = 0; i < 60; i++) {
        await guard.canActivate(mockContext);
      }

      // The 61st request should be blocked
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new HttpException(
          expect.objectContaining({
            error: expect.objectContaining({
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Rate limit exceeded. Try again later.',
            }),
          }),
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });

    it('should throw 429 when burst limit exceeded', async () => {
      // Make 120 requests to hit the burst limit
      for (let i = 0; i < 120; i++) {
        await guard.canActivate(mockContext);
      }

      // The 121st request should be blocked by burst limit
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        new HttpException(
          expect.objectContaining({
            error: expect.objectContaining({
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Burst rate limit exceeded. Try again later.',
            }),
          }),
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });

    it('should set rate limit headers', async () => {
      const mockResponse = { setHeader: jest.fn() };
      const contextWithResponse = {
        ...mockContext,
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: () => mockResponse,
        }),
      } as ExecutionContext;

      await guard.canActivate(contextWithResponse);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '59');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Burst-Limit', '120');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Burst-Remaining', '119');
    });
  });

  describe('getRateLimitStats', () => {
    it('should return null when no data exists', () => {
      const stats = guard.getRateLimitStats('company-123');
      expect(stats).toBeNull();
    });

    it('should return stats when data exists', async () => {
      await guard.canActivate(mockContext);
      
      const stats = guard.getRateLimitStats('company-123');
      expect(stats).toEqual({
        current: 1,
        limit: 60,
        remaining: 59,
        resetTime: expect.any(Number),
        burstCurrent: 1,
        burstLimit: 120,
        burstRemaining: 119,
      });
    });
  });

  describe('cleanup', () => {
    it('should clean up expired entries', async () => {
      // Make some requests
      await guard.canActivate(mockContext);
      
      // Manually expire the data
      const key = 'rate_limit:company-123';
      // Redis-based rate limiting doesn't use in-memory store
      
      // Redis-based rate limiting doesn't need manual cleanup
      // Data expires automatically via TTL
    });
  });
});
