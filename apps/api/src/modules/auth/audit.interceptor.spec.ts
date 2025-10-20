import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AuthService } from './auth.service';
import { prisma } from '@email-gateway/database';

// Mock Prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditInterceptor,
        {
          provide: AuthService,
          useValue: {
            logAuditEvent: jest.fn(),
          },
        },
      ],
    }).compile();

    interceptor = module.get<AuditInterceptor>(AuditInterceptor);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    const createMockContext = (overrides = {}) => ({
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          url: '/v1/email/send',
          headers: {
            'user-agent': 'test-agent',
            'x-request-id': 'req-123',
          },
          body: { to: 'test@example.com' },
          ip: '192.168.1.1',
          ...overrides,
        }),
        getResponse: () => ({
          statusCode: 200,
        }),
      }),
    }) as ExecutionContext;

    const createMockHandler = (shouldThrow = false) => ({
      handle: () => shouldThrow ? throwError(() => new Error('Test error')) : of({ success: true }),
    }) as CallHandler;

    it('should log successful request', async () => {
      const context = createMockContext({
        companyId: 'company-123',
        userId: 'user-456',
      });
      const handler = createMockHandler(false);

      const result = await interceptor.intercept(context, handler).toPromise();

      expect(result).toEqual({ success: true });
      expect(authService.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-123',
          userId: 'user-456',
          action: 'POST /v1/email/send',
          resource: 'email',
          resourceId: undefined,
          ipAddress: '192.168.1.1',
          userAgent: 'test-agent',
          statusCode: 200,
          duration: expect.any(Number),
          success: true,
        })
      );
    });

    it('should log failed request', async () => {
      const context = createMockContext({
        companyId: 'company-123',
      });
      const handler = createMockHandler(true);

      try {
        await interceptor.intercept(context, handler).toPromise();
      } catch (error: any) {
        expect(error.message).toBe('Test error');
      }

      expect(authService.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-123',
          userId: undefined,
          action: 'POST /v1/email/send',
          resource: 'email',
          resourceId: undefined,
          ipAddress: '192.168.1.1',
          userAgent: 'test-agent',
          statusCode: 500,
          duration: expect.any(Number),
          success: false,
          error: 'Test error',
        })
      );
    });

    it('should extract resource from URL', async () => {
      const context = createMockContext({
        url: '/v1/domains/example.com/verify',
        companyId: 'company-123',
      });
      const handler = createMockHandler(false);

      await interceptor.intercept(context, handler).toPromise();

      expect(authService.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'POST /v1/domains/example.com/verify',
          resource: 'domain',
          resourceId: 'example.com',
        })
      );
    });

    it('should handle requests without companyId', async () => {
      const context = createMockContext({
        url: '/v1/health',
      });
      const handler = createMockHandler(false);

      await interceptor.intercept(context, handler).toPromise();

      expect(authService.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: undefined,
          action: 'POST /v1/health',
          resource: 'health',
        })
      );
    });

    it('should extract IP from X-Forwarded-For header', async () => {
      const context = createMockContext({
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18',
          'user-agent': 'test-agent',
        },
        companyId: 'company-123',
      });
      const handler = createMockHandler(false);

      await interceptor.intercept(context, handler).toPromise();

      expect(authService.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '203.0.113.195',
        })
      );
    });

    it('should extract IP from X-Real-IP header', async () => {
      const context = createMockContext({
        headers: {
          'x-real-ip': '203.0.113.195',
          'user-agent': 'test-agent',
        },
        companyId: 'company-123',
      });
      const handler = createMockHandler(false);

      await interceptor.intercept(context, handler).toPromise();

      expect(authService.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '203.0.113.195',
        })
      );
    });

    it('should handle missing user agent', async () => {
      const context = createMockContext({
        headers: {},
        companyId: 'company-123',
      });
      const handler = createMockHandler(false);

      await interceptor.intercept(context, handler).toPromise();

      expect(authService.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: undefined,
        })
      );
    });

    it('should calculate duration correctly', async () => {
      const context = createMockContext({
        companyId: 'company-123',
      });
      const handler = createMockHandler(false);

      const startTime = Date.now();
      await interceptor.intercept(context, handler).toPromise();
      const endTime = Date.now();

      expect(authService.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          duration: expect.any(Number),
        })
      );

      const loggedDuration = (authService.logAuditEvent as jest.Mock).mock.calls[0][0].duration;
      expect(loggedDuration).toBeGreaterThanOrEqual(0);
      expect(loggedDuration).toBeLessThanOrEqual(endTime - startTime);
    });
  });
});