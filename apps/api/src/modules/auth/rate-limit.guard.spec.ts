import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';
import { AuthService } from './auth.service';
import { RedisService } from './redis.service';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let authService: AuthService;
  let redisService: RedisService;

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
        {
          provide: RedisService,
          useValue: {
            incr: jest.fn(),
            expire: jest.fn(),
            ttl: jest.fn(),
            get: jest.fn(),
            isConnected: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
    authService = module.get<AuthService>(AuthService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow request when within rate limits', async () => {
      // Mock Redis responses for successful rate limiting
      // First call is for burst, second call is for RPS
      (redisService.incr as jest.Mock)
        .mockResolvedValueOnce(1) // burst count
        .mockResolvedValueOnce(1); // rps count
      (redisService.expire as jest.Mock).mockResolvedValue(1);
      (redisService.ttl as jest.Mock).mockResolvedValue(60);

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
      // Mock Redis to simulate rate limit exceeded
      // First call is for burst (within limit), second call is for RPS (exceeds limit)
      (redisService.incr as jest.Mock)
        .mockResolvedValueOnce(1) // burst count (within limit)
        .mockResolvedValueOnce(61); // rps count (exceeds limit)
      (redisService.expire as jest.Mock).mockResolvedValue(1);
      (redisService.ttl as jest.Mock).mockResolvedValue(1);

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
      // Mock Redis to simulate burst limit exceeded
      // Burst is checked first, so only need one incr call that exceeds the limit
      (redisService.incr as jest.Mock).mockResolvedValue(121); // Exceeds burst limit
      (redisService.expire as jest.Mock).mockResolvedValue(1);
      (redisService.ttl as jest.Mock).mockResolvedValue(1);

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

      // Mock Redis responses - burst first, then rps
      (redisService.incr as jest.Mock)
        .mockResolvedValueOnce(1) // burst count
        .mockResolvedValueOnce(1); // rps count
      (redisService.expire as jest.Mock).mockResolvedValue(1);
      (redisService.ttl as jest.Mock).mockResolvedValue(60);

      await guard.canActivate(contextWithResponse);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '59');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Burst-Limit', '120');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Burst-Remaining', '119');
    });

    it('should handle Redis connection failure gracefully', async () => {
      // Mock Redis connection failure
      (redisService.incr as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

      // Should allow request when Redis fails (fail-open strategy)
      const result = await guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should use custom rate limit config from AuthService', async () => {
      const customConfig = {
        rps: 30,
        burst: 60,
        windowMs: 2000,
      };

      (authService.getRateLimitConfig as jest.Mock).mockReturnValue(customConfig);
      (redisService.incr as jest.Mock)
        .mockResolvedValueOnce(1) // burst count
        .mockResolvedValueOnce(1); // rps count
      (redisService.expire as jest.Mock).mockResolvedValue(1);
      (redisService.ttl as jest.Mock).mockResolvedValue(120);

      const mockResponse = { setHeader: jest.fn() };
      const contextWithResponse = {
        ...mockContext,
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: () => mockResponse,
        }),
      } as ExecutionContext;

      await guard.canActivate(contextWithResponse);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '30');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '29');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Burst-Limit', '60');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-RateLimit-Burst-Remaining', '59');
    });
  });

  describe('Redis integration', () => {
    it('should call Redis incr with correct keys', async () => {
      (redisService.incr as jest.Mock)
        .mockResolvedValueOnce(1) // burst count
        .mockResolvedValueOnce(1); // rps count
      (redisService.expire as jest.Mock).mockResolvedValue(1);
      (redisService.ttl as jest.Mock).mockResolvedValue(60);

      await guard.canActivate(mockContext);

      // Should call incr twice - once for burst, once for rps
      expect(redisService.incr).toHaveBeenCalledTimes(2);
      expect(redisService.incr).toHaveBeenCalledWith(expect.stringContaining('rate_limit:burst:company-123:'));
      expect(redisService.incr).toHaveBeenCalledWith(expect.stringContaining('rate_limit:rps:company-123:'));
    });

    it('should call Redis expire with correct TTL', async () => {
      (redisService.incr as jest.Mock)
        .mockResolvedValueOnce(1) // burst count
        .mockResolvedValueOnce(1); // rps count
      (redisService.expire as jest.Mock).mockResolvedValue(1);
      (redisService.ttl as jest.Mock).mockResolvedValue(60);

      await guard.canActivate(mockContext);

      // Should call expire twice - once for burst, once for rps
      expect(redisService.expire).toHaveBeenCalledTimes(2);
      expect(redisService.expire).toHaveBeenCalledWith(expect.stringContaining('rate_limit:burst:company-123:'), 1);
      expect(redisService.expire).toHaveBeenCalledWith(expect.stringContaining('rate_limit:rps:company-123:'), 1);
    });
  });
});
