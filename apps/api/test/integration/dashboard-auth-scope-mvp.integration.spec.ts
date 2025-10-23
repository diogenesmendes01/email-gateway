import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { BasicAuthGuard } from '../../src/modules/auth/basic-auth.guard';

describe('Dashboard Auth Scope MVP (Integration)', () => {
  let app: INestApplication;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // Set global prefix to match production behavior
    app.setGlobalPrefix('v1');
    
    configService = moduleFixture.get<ConfigService>(ConfigService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Dashboard Access Control', () => {
    it('should protect dashboard routes with Basic Auth', async () => {
      // Arrange
      const dashboardRoutes = [
        '/dashboard',
        '/dashboard/metrics',
        '/dashboard/logs',
        '/dashboard/audit',
      ];

      // Act & Assert
      for (const route of dashboardRoutes) {
        const response = await request(app.getHttpServer())
          .get(route)
          .expect(401);

        expect(response.headers['www-authenticate']).toContain('Basic');
        expect(response.headers['www-authenticate']).toContain('Dashboard MVP - Acesso Restrito');
      }
    });

    it('should allow access with valid Basic Auth credentials', async () => {
      // Arrange
      const validCredentials = Buffer.from('admin:password').toString('base64');

      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard')
        .set('Authorization', `Basic ${validCredentials}`)
        .expect(200);

      // Assert
      expect(response.body).toBeDefined();
    });

    it('should reject access with invalid Basic Auth credentials', async () => {
      // Arrange
      const invalidCredentials = Buffer.from('admin:wrongpassword').toString('base64');

      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard')
        .set('Authorization', `Basic ${invalidCredentials}`)
        .expect(401);

      // Assert
      expect(response.headers['www-authenticate']).toContain('Basic');
    });

    it('should reject access without Authorization header', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard')
        .expect(401);

      // Assert
      expect(response.headers['www-authenticate']).toContain('Basic');
    });
  });

  describe('Dashboard Functionality', () => {
    let validAuthHeader: string;

    beforeEach(() => {
      const validCredentials = Buffer.from('admin:password').toString('base64');
      validAuthHeader = `Basic ${validCredentials}`;
    });

    it('should provide dashboard metrics endpoint', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/metrics')
        .set('Authorization', validAuthHeader)
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('totalSent');
      expect(response.body).toHaveProperty('totalFailed');
      expect(response.body).toHaveProperty('successRate');
      expect(response.body).toHaveProperty('lastUpdated');
    });

    it('should provide email logs endpoint', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/logs')
        .set('Authorization', validAuthHeader)
        .query({ limit: 10, offset: 0 })
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('logs');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('hasMore');
      expect(Array.isArray(response.body.logs)).toBe(true);
    });

    it('should provide audit trail endpoint', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/audit')
        .set('Authorization', validAuthHeader)
        .query({ days: 7 })
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('auditEvents');
      expect(response.body).toHaveProperty('period');
      expect(Array.isArray(response.body.auditEvents)).toBe(true);
    });

    it('should support filtering logs by company', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/logs')
        .set('Authorization', validAuthHeader)
        .query({ companyId: 'test-company', limit: 5 })
        .expect(200);

      // Assert
      expect(response.body.logs).toBeDefined();
      // All logs should belong to the specified company
      response.body.logs.forEach((log: any) => {
        expect(log.companyId).toBe('test-company');
      });
    });
  });

  describe('Security Headers', () => {
    it('should include security headers for dashboard routes', async () => {
      // Arrange
      const validCredentials = Buffer.from('admin:password').toString('base64');

      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard')
        .set('Authorization', `Basic ${validCredentials}`)
        .expect(200);

      // Assert
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });

    it('should include CSP header for dashboard', async () => {
      // Arrange
      const validCredentials = Buffer.from('admin:password').toString('base64');

      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard')
        .set('Authorization', `Basic ${validCredentials}`)
        .expect(200);

      // Assert
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['content-security-policy']).toContain("script-src 'self'");
      expect(response.headers['content-security-policy']).toContain("style-src 'self'");
    });
  });

  describe('PII Protection', () => {
    let validAuthHeader: string;

    beforeEach(() => {
      const validCredentials = Buffer.from('admin:password').toString('base64');
      validAuthHeader = `Basic ${validCredentials}`;
    });

    it('should mask CPF/CNPJ in dashboard responses', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/logs')
        .set('Authorization', validAuthHeader)
        .query({ limit: 1 })
        .expect(200);

      // Assert
      if (response.body.logs.length > 0) {
        const log = response.body.logs[0];
        if (log.recipient?.cpfCnpj) {
          expect(log.recipient.cpfCnpj).toMatch(/\d{3}\.\*\*\*\.\*\*\*-\d{2}/);
        }
      }
    });

    it('should not expose sensitive data in error messages', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/logs')
        .set('Authorization', validAuthHeader)
        .query({ invalidParam: 'test' })
        .expect(400);

      // Assert
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).not.toContain('password');
      expect(response.body.error.message).not.toContain('secret');
      expect(response.body.error.message).not.toContain('key');
    });
  });

  describe('Performance Requirements', () => {
    let validAuthHeader: string;

    beforeEach(() => {
      const validCredentials = Buffer.from('admin:password').toString('base64');
      validAuthHeader = `Basic ${validCredentials}`;
    });

    it('should respond to dashboard requests within acceptable time', async () => {
      // Arrange
      const startTime = Date.now();

      // Act
      await request(app.getHttpServer())
        .get('/dashboard/metrics')
        .set('Authorization', validAuthHeader)
        .expect(200);

      // Assert
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Less than 1 second
    });

    it('should handle concurrent dashboard requests', async () => {
      // Arrange
      const requests = Array(5).fill(null).map(() =>
        request(app.getHttpServer())
          .get('/dashboard/metrics')
          .set('Authorization', validAuthHeader)
      );

      // Act
      const responses = await Promise.all(requests);

      // Assert
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('MVP Scope Validation', () => {
    it('should confirm no advanced authentication features are available', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/auth/features')
        .set('Authorization', `Basic ${Buffer.from('admin:password').toString('base64')}`)
        .expect(404); // Endpoint should not exist

      // Assert
      expect(response.body.error).toBeDefined();
    });

    it('should confirm no RBAC endpoints are available', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/users')
        .set('Authorization', `Basic ${Buffer.from('admin:password').toString('base64')}`)
        .expect(404); // Endpoint should not exist

      // Assert
      expect(response.body.error).toBeDefined();
    });

    it('should confirm audit is limited to basic logging', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/audit')
        .set('Authorization', `Basic ${Buffer.from('admin:password').toString('base64')}`)
        .expect(200);

      // Assert
      expect(response.body.auditEvents).toBeDefined();
      // Should only have basic audit events, not user-specific actions
      response.body.auditEvents.forEach((event: any) => {
        expect(event.type).toMatch(/^(email_sent|email_failed|system_event)$/);
      });
    });
  });
});
