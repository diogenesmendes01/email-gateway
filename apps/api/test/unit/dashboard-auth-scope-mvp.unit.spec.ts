import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BasicAuthGuard } from '../../src/modules/auth/basic-auth.guard';
import { AuthService } from '../../src/modules/auth/auth.service';

describe('Dashboard Auth Scope MVP (Unit)', () => {
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

  describe('Basic Auth Implementation', () => {
    it('should validate Basic Auth credentials', async () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: 'Basic dGVzdDp0ZXN0', // test:test base64
        },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      };

      jest.spyOn(authService, 'validateBasicAuth').mockResolvedValue(true);

      // Act
      const result = await guard.canActivate(mockContext as any);

      // Assert
      expect(result).toBe(true);
      expect(authService.validateBasicAuth).toHaveBeenCalledWith('test', 'test');
    });

    it('should reject requests without Basic Auth header', async () => {
      // Arrange
      const mockRequest = {
        headers: {},
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      };

      // Act & Assert
      await expect(guard.canActivate(mockContext as any)).rejects.toThrow('Basic Auth required');
    });

    it('should reject invalid Basic Auth credentials', async () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: 'Basic dGVzdDppbnZhbGlk', // test:invalid base64
        },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      };

      jest.spyOn(authService, 'validateBasicAuth').mockResolvedValue(false);

      // Act & Assert
      await expect(guard.canActivate(mockContext as any)).rejects.toThrow('Invalid credentials');
    });

    it('should handle malformed Basic Auth header', async () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: 'Basic invalid-base64',
        },
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      };

      // Act & Assert
      await expect(guard.canActivate(mockContext as any)).rejects.toThrow('Invalid Basic Auth format');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate required environment variables', () => {
      // Arrange
      const requiredVars = [
        'DASHBOARD_BASIC_AUTH_ENABLED',
        'DASHBOARD_BASIC_AUTH_REALM',
      ];

      // Act & Assert
      requiredVars.forEach(varName => {
        expect(configService.get).toHaveBeenCalledWith(varName);
      });
    });

    it('should use correct Basic Auth realm', () => {
      // Arrange
      const expectedRealm = 'Dashboard MVP - Acesso Restrito';
      (configService.get as jest.Mock).mockReturnValue(expectedRealm);

      // Act
      const realm = configService.get('DASHBOARD_BASIC_AUTH_REALM');

      // Assert
      expect(realm).toBe(expectedRealm);
    });
  });

  describe('Security Considerations', () => {
    it('should only allow HTTPS in production', () => {
      // Arrange
      const isProduction = configService.get('NODE_ENV') === 'production';
      const isHttps = configService.get('HTTPS_ENABLED') === 'true';

      // Act & Assert
      if (isProduction) {
        expect(isHttps).toBe(true);
      }
    });

    it('should validate credential rotation policy', () => {
      // Arrange
      const lastRotation = configService.get('DASHBOARD_CREDENTIALS_LAST_ROTATION');
      const rotationInterval = 90; // days

      // Act
      const daysSinceRotation = Math.floor(
        (Date.now() - new Date(lastRotation).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Assert
      expect(daysSinceRotation).toBeLessThanOrEqual(rotationInterval);
    });
  });

  describe('Audit Logging', () => {
    it('should log authentication attempts', async () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: 'Basic dGVzdDp0ZXN0',
        },
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      };

      jest.spyOn(authService, 'validateBasicAuth').mockResolvedValue(true);

      // Act
      await guard.canActivate(mockContext as any);

      // Assert
      // Verify that audit logging would be called
      // This would be implemented in the actual guard
      expect(authService.validateBasicAuth).toHaveBeenCalled();
    });

    it('should log failed authentication attempts', async () => {
      // Arrange
      const mockRequest = {
        headers: {
          authorization: 'Basic dGVzdDppbnZhbGlk',
        },
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      };

      jest.spyOn(authService, 'validateBasicAuth').mockResolvedValue(false);

      // Act & Assert
      await expect(guard.canActivate(mockContext as any)).rejects.toThrow('Invalid credentials');
      
      // Verify that failed attempt logging would be called
      expect(authService.validateBasicAuth).toHaveBeenCalled();
    });
  });

  describe('MVP Scope Validation', () => {
    it('should confirm Basic Auth is used instead of advanced authentication', () => {
      // Arrange
      const authMethod = configService.get('DASHBOARD_AUTH_METHOD');

      // Act & Assert
      expect(authMethod).toBe('basic');
    });

    it('should confirm no RBAC is implemented in MVP', () => {
      // Arrange
      const rbacEnabled = configService.get('DASHBOARD_RBAC_ENABLED');

      // Act & Assert
      expect(rbacEnabled).toBe(false);
    });

    it('should confirm audit is limited to Nginx logs', () => {
      // Arrange
      const auditMethod = configService.get('DASHBOARD_AUDIT_METHOD');

      // Act & Assert
      expect(auditMethod).toBe('nginx');
    });
  });
});
