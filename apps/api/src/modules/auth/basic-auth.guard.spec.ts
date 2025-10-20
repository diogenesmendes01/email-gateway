import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { BasicAuthGuard } from './basic-auth.guard';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

describe('BasicAuthGuard', () => {
  let guard: BasicAuthGuard;
  let authService: AuthService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BasicAuthGuard,
        {
          provide: AuthService,
          useValue: {
            validateBasicAuth: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<BasicAuthGuard>(BasicAuthGuard);
    authService = module.get<AuthService>(AuthService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    const createMockContext = (authHeader?: string) => ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization: authHeader,
          },
        }),
      }),
    }) as ExecutionContext;

    it('should allow access with valid Basic Auth', async () => {
      const authHeader = 'Basic YWRtaW46cGFzc3dvcmQxMjM=';
      const context = createMockContext(authHeader);

      (authService.validateBasicAuth as jest.Mock).mockResolvedValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(authService.validateBasicAuth).toHaveBeenCalledWith('admin', 'password123');
    });

    it('should throw UnauthorizedException when no authorization header', async () => {
      const context = createMockContext();

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Basic authentication required')
      );

      expect(authService.validateBasicAuth).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when authorization header is not Basic', async () => {
      const authHeader = 'Bearer token123';
      const context = createMockContext(authHeader);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Basic authentication required')
      );

      expect(authService.validateBasicAuth).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when Basic Auth is malformed', async () => {
      const authHeader = 'Basic invalid_base64';
      const context = createMockContext(authHeader);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid Basic authentication format')
      );

      expect(authService.validateBasicAuth).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when credentials are invalid', async () => {
      const authHeader = 'Basic YWRtaW46d3JvbmdwYXNzd29yZA==';
      const context = createMockContext(authHeader);

      (authService.validateBasicAuth as jest.Mock).mockResolvedValue(false);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials')
      );

      expect(authService.validateBasicAuth).toHaveBeenCalledWith('admin', 'wrongpassword');
    });

    it('should handle empty credentials', async () => {
      const authHeader = 'Basic Og=='; // Empty username:password
      const context = createMockContext(authHeader);

      (authService.validateBasicAuth as jest.Mock).mockResolvedValue(false);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials')
      );

      expect(authService.validateBasicAuth).toHaveBeenCalledWith('', '');
    });

    it('should handle credentials with special characters', async () => {
      const authHeader = 'Basic dXNlcjpwYXNzOndvcmQ='; // user:pass:word
      const context = createMockContext(authHeader);

      (authService.validateBasicAuth as jest.Mock).mockResolvedValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(authService.validateBasicAuth).toHaveBeenCalledWith('user', 'pass:word');
    });

    it('should handle credentials with spaces', async () => {
      const authHeader = 'Basic dXNlciB0ZXN0OnBhc3Mgd29yZA=='; // user test:pass word
      const context = createMockContext(authHeader);

      (authService.validateBasicAuth as jest.Mock).mockResolvedValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(authService.validateBasicAuth).toHaveBeenCalledWith('user test', 'pass word');
    });

    it('should handle AuthService errors', async () => {
      const authHeader = 'Basic YWRtaW46cGFzc3dvcmQxMjM=';
      const context = createMockContext(authHeader);

      (authService.validateBasicAuth as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Authentication service unavailable')
      );
    });
  });
});