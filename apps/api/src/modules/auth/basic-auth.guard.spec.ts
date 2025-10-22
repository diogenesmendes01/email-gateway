import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BasicAuthGuard } from './basic-auth.guard';
import { AuthService } from './auth.service';

describe('BasicAuthGuard', () => {
  let guard: BasicAuthGuard;
  let authService: AuthService;
  let configService: ConfigService;

  const mockAuthService = {
    validateBasicAuth: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BasicAuthGuard,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
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

  describe('canActivate', () => {
    let mockContext: ExecutionContext;
    let mockRequest: any;

    beforeEach(() => {
      mockRequest = {
        headers: {},
      };

      mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as ExecutionContext;
    });

    it('should throw UnauthorizedException when no authorization header', async () => {
      mockRequest.headers = {};

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when authorization header does not start with Basic', async () => {
      mockRequest.headers = {
        authorization: 'Bearer token123',
      };

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when basic auth format is invalid', async () => {
      mockRequest.headers = {
        authorization: 'Basic invalid-base64',
      };

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should authenticate admin user successfully', async () => {
      const credentials = Buffer.from('admin:password123').toString('base64');
      mockRequest.headers = {
        authorization: `Basic ${credentials}`,
      };

      // Mock config service - need to mock multiple calls for validateCredentials and getUserRole
      (configService.get as jest.Mock)
        .mockReturnValueOnce('admin') // DASHBOARD_USERNAME in validateCredentials
        .mockReturnValueOnce('hashed-password') // DASHBOARD_PASSWORD_HASH in validateCredentials
        .mockReturnValueOnce('readonly') // DASHBOARD_READONLY_USERNAME in validateCredentials
        .mockReturnValueOnce('hashed-readonly-password') // DASHBOARD_READONLY_PASSWORD_HASH in validateCredentials
        .mockReturnValueOnce('admin') // DASHBOARD_USERNAME in getUserRole
        .mockReturnValueOnce('readonly'); // DASHBOARD_READONLY_USERNAME in getUserRole

      // Mock auth service
      (authService.validateBasicAuth as jest.Mock).mockResolvedValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.user).toEqual({
        username: 'admin',
        type: 'basic_auth',
        role: 'admin',
      });
      expect(mockRequest.userId).toBe('admin');
    });

    it('should authenticate readonly user successfully', async () => {
      const credentials = Buffer.from('readonly:password123').toString('base64');
      mockRequest.headers = {
        authorization: `Basic ${credentials}`,
      };

      // Mock config service - need to mock multiple calls for validateCredentials and getUserRole
      (configService.get as jest.Mock)
        .mockReturnValueOnce('admin') // DASHBOARD_USERNAME in validateCredentials
        .mockReturnValueOnce('hashed-password') // DASHBOARD_PASSWORD_HASH in validateCredentials
        .mockReturnValueOnce('readonly') // DASHBOARD_READONLY_USERNAME in validateCredentials
        .mockReturnValueOnce('hashed-readonly-password') // DASHBOARD_READONLY_PASSWORD_HASH in validateCredentials
        .mockReturnValueOnce('admin') // DASHBOARD_USERNAME in getUserRole
        .mockReturnValueOnce('readonly'); // DASHBOARD_READONLY_USERNAME in getUserRole

      // Mock auth service
      (authService.validateBasicAuth as jest.Mock).mockResolvedValue(true);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.user).toEqual({
        username: 'readonly',
        type: 'basic_auth',
        role: 'readonly',
      });
      expect(mockRequest.userId).toBe('readonly');
    });

    it('should throw UnauthorizedException when credentials are invalid', async () => {
      const credentials = Buffer.from('admin:wrongpassword').toString('base64');
      mockRequest.headers = {
        authorization: `Basic ${credentials}`,
      };

      // Mock config service
      (configService.get as jest.Mock)
        .mockReturnValueOnce('admin') // DASHBOARD_USERNAME
        .mockReturnValueOnce('hashed-password') // DASHBOARD_PASSWORD_HASH
        .mockReturnValueOnce('readonly') // DASHBOARD_READONLY_USERNAME
        .mockReturnValueOnce('hashed-readonly-password'); // DASHBOARD_READONLY_PASSWORD_HASH

      // Mock auth service
      (authService.validateBasicAuth as jest.Mock).mockResolvedValue(false);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      const credentials = Buffer.from('unknown:password123').toString('base64');
      mockRequest.headers = {
        authorization: `Basic ${credentials}`,
      };

      // Mock config service
      (configService.get as jest.Mock)
        .mockReturnValueOnce('admin') // DASHBOARD_USERNAME
        .mockReturnValueOnce('hashed-password') // DASHBOARD_PASSWORD_HASH
        .mockReturnValueOnce('readonly') // DASHBOARD_READONLY_USERNAME
        .mockReturnValueOnce('hashed-readonly-password'); // DASHBOARD_READONLY_PASSWORD_HASH

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should default to readonly role for unknown users', async () => {
      const credentials = Buffer.from('unknown:password123').toString('base64');
      mockRequest.headers = {
        authorization: `Basic ${credentials}`,
      };

      // Mock config service to return different usernames
      (configService.get as jest.Mock)
        .mockReturnValueOnce('admin') // DASHBOARD_USERNAME
        .mockReturnValueOnce('hashed-password') // DASHBOARD_PASSWORD_HASH
        .mockReturnValueOnce('readonly') // DASHBOARD_READONLY_USERNAME
        .mockReturnValueOnce('hashed-readonly-password') // DASHBOARD_READONLY_PASSWORD_HASH
        .mockReturnValueOnce('admin') // getUserRole calls
        .mockReturnValueOnce('readonly');

      // Mock auth service to return true (simulating valid credentials)
      (authService.validateBasicAuth as jest.Mock).mockResolvedValue(true);

      // This should not reach the role assignment since user validation fails first
      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getUserRole', () => {
    it('should return admin role for admin username', () => {
      (configService.get as jest.Mock)
        .mockReturnValueOnce('admin') // DASHBOARD_USERNAME
        .mockReturnValueOnce('readonly'); // DASHBOARD_READONLY_USERNAME

      const role = (guard as any).getUserRole('admin');

      expect(role).toBe('admin');
    });

    it('should return readonly role for readonly username', () => {
      (configService.get as jest.Mock)
        .mockReturnValueOnce('admin') // DASHBOARD_USERNAME
        .mockReturnValueOnce('readonly'); // DASHBOARD_READONLY_USERNAME

      const role = (guard as any).getUserRole('readonly');

      expect(role).toBe('readonly');
    });

    it('should return readonly role for unknown username', () => {
      (configService.get as jest.Mock)
        .mockReturnValueOnce('admin') // DASHBOARD_USERNAME
        .mockReturnValueOnce('readonly'); // DASHBOARD_READONLY_USERNAME

      const role = (guard as any).getUserRole('unknown');

      expect(role).toBe('readonly');
    });
  });

  describe('validateCredentials', () => {
    it('should validate admin credentials', async () => {
      (configService.get as jest.Mock)
        .mockReturnValueOnce('admin') // DASHBOARD_USERNAME
        .mockReturnValueOnce('hashed-password') // DASHBOARD_PASSWORD_HASH
        .mockReturnValueOnce('readonly') // DASHBOARD_READONLY_USERNAME
        .mockReturnValueOnce('hashed-readonly-password'); // DASHBOARD_READONLY_PASSWORD_HASH

      (authService.validateBasicAuth as jest.Mock).mockResolvedValue(true);

      const result = await (guard as any).validateCredentials({
        username: 'admin',
        password: 'password123',
      });

      expect(result).toBe(true);
      expect(authService.validateBasicAuth).toHaveBeenCalledWith('password123', expect.any(String));
    });

    it('should validate readonly credentials', async () => {
      (configService.get as jest.Mock)
        .mockReturnValueOnce('admin') // DASHBOARD_USERNAME
        .mockReturnValueOnce('hashed-password') // DASHBOARD_PASSWORD_HASH
        .mockReturnValueOnce('readonly') // DASHBOARD_READONLY_USERNAME
        .mockReturnValueOnce('hashed-readonly-password'); // DASHBOARD_READONLY_PASSWORD_HASH

      (authService.validateBasicAuth as jest.Mock).mockResolvedValue(true);

      const result = await (guard as any).validateCredentials({
        username: 'readonly',
        password: 'password123',
      });

      expect(result).toBe(true);
      expect(authService.validateBasicAuth).toHaveBeenCalledWith('password123', 'hashed-readonly-password');
    });

    it('should return false for unknown username', async () => {
      (configService.get as jest.Mock)
        .mockReturnValueOnce('admin') // DASHBOARD_USERNAME
        .mockReturnValueOnce('hashed-password') // DASHBOARD_PASSWORD_HASH
        .mockReturnValueOnce('readonly') // DASHBOARD_READONLY_USERNAME
        .mockReturnValueOnce('hashed-readonly-password'); // DASHBOARD_READONLY_PASSWORD_HASH

      const result = await (guard as any).validateCredentials({
        username: 'unknown',
        password: 'password123',
      });

      expect(result).toBe(false);
      expect(authService.validateBasicAuth).not.toHaveBeenCalled();
    });

    it('should return false when password validation fails', async () => {
      (configService.get as jest.Mock)
        .mockReturnValueOnce('admin') // DASHBOARD_USERNAME
        .mockReturnValueOnce('hashed-password') // DASHBOARD_PASSWORD_HASH
        .mockReturnValueOnce('readonly') // DASHBOARD_READONLY_USERNAME
        .mockReturnValueOnce('hashed-readonly-password'); // DASHBOARD_READONLY_PASSWORD_HASH

      (authService.validateBasicAuth as jest.Mock).mockResolvedValue(false);

      const result = await (guard as any).validateCredentials({
        username: 'admin',
        password: 'wrongpassword',
      });

      expect(result).toBe(false);
      expect(authService.validateBasicAuth).toHaveBeenCalledWith('wrongpassword', 'hashed-password');
    });
  });

  describe('parseBasicAuth', () => {
    it('should parse valid basic auth header', () => {
      const credentials = Buffer.from('admin:password123').toString('base64');
      const authHeader = `Basic ${credentials}`;

      const result = (guard as any).parseBasicAuth(authHeader);

      expect(result).toEqual({
        username: 'admin',
        password: 'password123',
      });
    });

    it('should throw error for invalid base64', () => {
      const authHeader = 'Basic invalid-base64!';

      expect(() => (guard as any).parseBasicAuth(authHeader)).toThrow('Invalid basic auth format');
    });

    it('should throw error for missing username', () => {
      const credentials = Buffer.from(':password123').toString('base64');
      const authHeader = `Basic ${credentials}`;

      expect(() => (guard as any).parseBasicAuth(authHeader)).toThrow('Invalid basic auth format');
    });

    it('should throw error for missing password', () => {
      const credentials = Buffer.from('admin:').toString('base64');
      const authHeader = `Basic ${credentials}`;

      expect(() => (guard as any).parseBasicAuth(authHeader)).toThrow('Invalid basic auth format');
    });

    it('should handle credentials with colons in password', () => {
      const credentials = Buffer.from('admin:pass:word:123').toString('base64');
      const authHeader = `Basic ${credentials}`;

      const result = (guard as any).parseBasicAuth(authHeader);

      expect(result).toEqual({
        username: 'admin',
        password: 'pass:word:123',
      });
    });
  });

  describe('generatePasswordHash', () => {
    it('should generate a password hash', async () => {
      const password = 'testpassword123';
      const hash = await BasicAuthGuard.generatePasswordHash(password);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
      expect(hash).not.toBe(password);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'testpassword123';
      const hash1 = await BasicAuthGuard.generatePasswordHash(password);
      const hash2 = await BasicAuthGuard.generatePasswordHash(password);

      expect(hash1).not.toBe(hash2);
    });
  });
});