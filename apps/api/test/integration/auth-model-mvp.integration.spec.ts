import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/modules/auth/auth.service';
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

describe('Auth Model MVP (Integration)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // Set global prefix to match production behavior
    app.setGlobalPrefix('v1');
    
    authService = moduleFixture.get<AuthService>(AuthService);
    configService = moduleFixture.get<ConfigService>(ConfigService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('API Key Authentication Flow', () => {
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
    });

    it('should authenticate valid API key', async () => {
      const apiKey = 'sk_live_valid123';
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);

      const response = await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
    });

    it('should reject request without API key', async () => {
      await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .expect(401);
    });

    it('should reject invalid API key', async () => {
      const apiKey = 'sk_live_invalid';
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as any);

      await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .set('X-API-Key', apiKey)
        .expect(401);
    });

    it('should reject expired API key', async () => {
      const apiKey = 'sk_live_expired';
      const expiredCompany = {
        ...mockCompany,
        apiKeyExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      };
      (prisma.company.findMany as jest.Mock).mockResolvedValue([expiredCompany]);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);

      await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .set('X-API-Key', apiKey)
        .expect(401);
    });

    it('should reject inactive company', async () => {
      const apiKey = 'sk_live_inactive';
      const inactiveCompany = {
        ...mockCompany,
        isActive: false,
      };
      (prisma.company.findMany as jest.Mock).mockResolvedValue([inactiveCompany]);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);

      await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .set('X-API-Key', apiKey)
        .expect(403);
    });

    it('should reject IP not in allowlist', async () => {
      const apiKey = 'sk_live_restricted';
      const restrictedCompany = {
        ...mockCompany,
        allowedIps: ['192.168.1.1'], // Different IP
      };
      (prisma.company.findMany as jest.Mock).mockResolvedValue([restrictedCompany]);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);

      await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .set('X-API-Key', apiKey)
        .set('X-Forwarded-For', '192.168.1.100') // Not in allowlist
        .expect(403);
    });

    it('should allow IP in allowlist', async () => {
      const apiKey = 'sk_live_allowed';
      const allowedCompany = {
        ...mockCompany,
        allowedIps: ['127.0.0.1', '192.168.1.1'],
      };
      (prisma.company.findMany as jest.Mock).mockResolvedValue([allowedCompany]);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);

      const response = await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .set('X-API-Key', apiKey)
        .set('X-Forwarded-For', '192.168.1.1')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
    });

    it('should allow all IPs when allowlist is empty', async () => {
      const apiKey = 'sk_live_open';
      const openCompany = {
        ...mockCompany,
        allowedIps: [],
      };
      (prisma.company.findMany as jest.Mock).mockResolvedValue([openCompany]);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);

      const response = await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .set('X-API-Key', apiKey)
        .set('X-Forwarded-For', '10.0.0.1')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
    });
  });

  describe('Basic Authentication Flow (Dashboard)', () => {
    beforeEach(() => {
      // Mock environment variables for Basic Auth
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

    it('should authenticate valid admin credentials', async () => {
      const credentials = Buffer.from('admin:admin123').toString('base64');

      const response = await request(app.getHttpServer())
        .get('/v1/dashboard/overview')
        .set('Authorization', `Basic ${credentials}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should authenticate valid readonly credentials', async () => {
      const credentials = Buffer.from('readonly:readonly123').toString('base64');

      const response = await request(app.getHttpServer())
        .get('/v1/dashboard/overview')
        .set('Authorization', `Basic ${credentials}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it('should reject invalid credentials', async () => {
      const credentials = Buffer.from('admin:wrongpassword').toString('base64');

      await request(app.getHttpServer())
        .get('/v1/dashboard/overview')
        .set('Authorization', `Basic ${credentials}`)
        .expect(401);
    });

    it('should reject request without Basic Auth', async () => {
      await request(app.getHttpServer())
        .get('/v1/dashboard/overview')
        .expect(401);
    });

    it('should reject malformed Basic Auth header', async () => {
      await request(app.getHttpServer())
        .get('/v1/dashboard/overview')
        .set('Authorization', 'Basic invalid-base64')
        .expect(401);
    });
  });

  describe('Request ID Propagation', () => {
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

    it('should propagate request ID through response headers', async () => {
      const apiKey = 'sk_live_test';
      const requestId = 'req-123-456';

      const response = await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .set('X-API-Key', apiKey)
        .set('X-Request-Id', requestId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(requestId);
    });

    it('should generate request ID if not provided', async () => {
      const apiKey = 'sk_live_test';

      const response = await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]+$/);
    });
  });

  describe('Audit Logging Integration', () => {
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
      (prisma.auditLog.create as jest.Mock).mockResolvedValue({});
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);
    });

    it('should log audit events for authenticated requests', async () => {
      const apiKey = 'sk_live_audit';
      const requestId = 'req-audit-123';

      await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .set('X-API-Key', apiKey)
        .set('X-Request-Id', requestId)
        .expect(200);

      // Verify that audit logging was called
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('should log failed authentication attempts', async () => {
      const apiKey = 'sk_live_invalid';
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as any);

      await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .set('X-API-Key', apiKey)
        .expect(401);

      // Audit logging should still be called for failed attempts
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('Rate Limiting Integration', () => {
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

    it('should apply rate limiting per company', async () => {
      const apiKey = 'sk_live_rate_limit';

      // Make multiple requests quickly
      const promises = Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .get('/v1/health/healthz')
          .set('X-API-Key', apiKey)
      );

      const responses = await Promise.all(promises);

      // All should succeed within rate limit
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it('should include rate limit headers in response', async () => {
      const apiKey = 'sk_live_headers';

      const response = await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .set('X-API-Key', apiKey)
        .expect(200);

      // Rate limit headers should be present
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');
    });
  });

  describe('Error Handling Integration', () => {
    it('should return proper error format for authentication failures', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('timestamp');
    });

    it('should return proper error format for authorization failures', async () => {
      const apiKey = 'sk_live_forbidden';
      const forbiddenCompany = {
        id: 'company-123',
        apiKeyPrefix: 'sk_live',
        apiKeyHash: 'hashed-key',
        apiKeyExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastUsedAt: null,
        allowedIps: ['127.0.0.1'],
        rateLimitConfig: { rps: 60, burst: 120, windowMs: 1000 },
        isActive: false, // Inactive company
      };
      (prisma.company.findMany as jest.Mock).mockResolvedValue([forbiddenCompany]);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as any);

      const response = await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .set('X-API-Key', apiKey)
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('timestamp');
    });
  });
});
