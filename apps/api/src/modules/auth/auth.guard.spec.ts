import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ApiKeyGuard } from './auth.guard';
import { AuthService, ApiKeyPayload } from './auth.service';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        {
          provide: AuthService,
          useValue: {
            validateApiKey: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<ApiKeyGuard>(ApiKeyGuard);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    const createMockContext = (apiKey?: string, ipAddress?: string) => ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-api-key': apiKey,
          },
          ip: ipAddress || '192.168.1.1',
        }),
      }),
    }) as ExecutionContext;

    it('should allow access with valid API key', async () => {
      const apiKey = 'sk_live_valid_key';
      const context = createMockContext(apiKey);
      const mockPayload: ApiKeyPayload = {
        companyId: 'company-123',
        prefix: 'sk_live',
        expiresAt: new Date(Date.now() + 86400000),
        allowedIps: [],
        isActive: true,
      };

      (authService.validateApiKey as jest.Mock).mockResolvedValue(mockPayload);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(authService.validateApiKey).toHaveBeenCalledWith(apiKey);
    });

    it('should throw UnauthorizedException when no API key provided', async () => {
      const context = createMockContext();

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('API Key is required')
      );

      expect(authService.validateApiKey).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when API key is invalid', async () => {
      const apiKey = 'sk_live_invalid_key';
      const context = createMockContext(apiKey);

      (authService.validateApiKey as jest.Mock).mockResolvedValue(null);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid API Key')
      );

      expect(authService.validateApiKey).toHaveBeenCalledWith(apiKey);
    });

    it('should throw ForbiddenException when company is inactive', async () => {
      const apiKey = 'sk_live_inactive_key';
      const context = createMockContext(apiKey);
      const mockPayload: ApiKeyPayload = {
        companyId: 'company-123',
        prefix: 'sk_live',
        expiresAt: new Date(Date.now() + 86400000),
        allowedIps: [],
        isActive: false,
      };

      (authService.validateApiKey as jest.Mock).mockResolvedValue(mockPayload);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new ForbiddenException('Company account is inactive')
      );

      expect(authService.validateApiKey).toHaveBeenCalledWith(apiKey);
    });

    it('should throw UnauthorizedException when API key is expired', async () => {
      const apiKey = 'sk_live_expired_key';
      const context = createMockContext(apiKey);
      const mockPayload: ApiKeyPayload = {
        companyId: 'company-123',
        prefix: 'sk_live',
        expiresAt: new Date(Date.now() - 86400000), // Expired
        allowedIps: [],
        isActive: true,
      };

      (authService.validateApiKey as jest.Mock).mockResolvedValue(mockPayload);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('API Key has expired')
      );

      expect(authService.validateApiKey).toHaveBeenCalledWith(apiKey);
    });

    it('should handle AuthService errors', async () => {
      const apiKey = 'sk_live_error_key';
      const context = createMockContext(apiKey);

      (authService.validateApiKey as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Authentication service unavailable')
      );
    });

    it('should extract API key from different header formats', async () => {
      const apiKey = 'sk_live_valid_key';
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'authorization': `Bearer ${apiKey}`,
            },
            ip: '192.168.1.1',
          }),
        }),
      } as ExecutionContext;

      const mockPayload: ApiKeyPayload = {
        companyId: 'company-123',
        prefix: 'sk_live',
        expiresAt: new Date(Date.now() + 86400000),
        allowedIps: [],
        isActive: true,
      };

      (authService.validateApiKey as jest.Mock).mockResolvedValue(mockPayload);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(authService.validateApiKey).toHaveBeenCalledWith(apiKey);
    });
  });
});