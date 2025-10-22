import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '@nestjs/config';

describe('DashboardController (Integration)', () => {
  let app: INestApplication;
  let dashboardService: DashboardService;

  // Helper function to create Basic Auth header
  const createAuthHeader = (username: string = 'admin', password: string = 'password123') => {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    return `Basic ${credentials}`;
  };

  const mockDashboardService = {
    getOverview: jest.fn(),
    getAuditLogs: jest.fn(),
    getRateLimitStats: jest.fn(),
    getCompanies: jest.fn(),
    getApiKeyStatus: jest.fn(),
    getMetrics: jest.fn(),
    getKPIs: jest.fn(),
    getEmails: jest.fn(),
    getEmailById: jest.fn(),
    getErrorBreakdown: jest.fn(),
  };

  const mockAuthService = {
    validateBasicAuth: jest.fn(),
    isApiKeyExpired: jest.fn(),
    isApiKeyNearExpiration: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    // Reset mocks
    mockAuthService.validateBasicAuth.mockResolvedValue(true);
    mockConfigService.get.mockImplementation((key: string) => {
      const config: Record<string, string> = {
        'DASHBOARD_USERNAME': 'admin',
        'DASHBOARD_PASSWORD_HASH': '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj8j/7qJ2V9O',
        'DASHBOARD_READONLY_USERNAME': 'readonly',
        'DASHBOARD_READONLY_PASSWORD_HASH': '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj8j/7qJ2V9O',
      };
      return config[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        {
          provide: DashboardService,
          useValue: mockDashboardService,
        },
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

    app = module.createNestApplication();
    await app.init();

    dashboardService = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /dashboard/kpis', () => {
    it('should return KPIs data', async () => {
      const mockKPIs = {
        totalEnviados: 100,
        totalEnviadosPeriodoAnterior: 80,
        taxaSucesso: 95.5,
        taxaSucessoPeriodoAnterior: 92.0,
        totalErros: 5,
        totalErrosPeriodoAnterior: 3,
        dlqCount: 2,
        latenciaMedia: 1500,
        latenciaP95: 2000,
        latenciaP99: 3000,
        periodo: 'today',
        comparacao: {
          enviados: 25.0,
          sucesso: 3.5,
          erros: 66.7,
        },
      };

      mockDashboardService.getKPIs.mockResolvedValue(mockKPIs);

      const response = await request(app.getHttpServer())
        .get('/dashboard/kpis')
        .set('Authorization', createAuthHeader())
        .set('Authorization', createAuthHeader())
        .expect(200);

      expect(response.body).toEqual(mockKPIs);
      expect(mockDashboardService.getKPIs).toHaveBeenCalledWith(undefined, undefined);
    });

    it('should return KPIs with period and company filters', async () => {
      const mockKPIs = {
        totalEnviados: 50,
        totalEnviadosPeriodoAnterior: 40,
        taxaSucesso: 98.0,
        taxaSucessoPeriodoAnterior: 95.0,
        totalErros: 1,
        totalErrosPeriodoAnterior: 2,
        dlqCount: 0,
        latenciaMedia: 1200,
        latenciaP95: 1800,
        latenciaP99: 2500,
        periodo: 'day',
        comparacao: {
          enviados: 25.0,
          sucesso: 3.0,
          erros: -50.0,
        },
      };

      mockDashboardService.getKPIs.mockResolvedValue(mockKPIs);

      const response = await request(app.getHttpServer())
        .get('/dashboard/kpis')
        .query({ period: 'day', companyId: 'company-123' })
        .set('Authorization', createAuthHeader())
        .set('Authorization', createAuthHeader())
        .expect(200);

      expect(response.body).toEqual(mockKPIs);
      expect(mockDashboardService.getKPIs).toHaveBeenCalledWith('day', 'company-123');
    });
  });

  describe('GET /dashboard/emails', () => {
    it('should return emails with default pagination', async () => {
      const mockEmails = {
        emails: [
          {
            id: 'email-1',
            externalId: 'ext-1',
            to: 'test@example.com',
            subject: 'Test Email',
            status: 'SENT',
            createdAt: '2024-01-01T00:00:00Z',
            sentAt: '2024-01-01T00:00:01Z',
            failedAt: null,
            errorCode: null,
            errorReason: null,
            attempts: 1,
            durationMs: 1500,
            companyId: 'company-1',
            recipient: {
              id: 'recipient-1',
              externalId: 'ext-1',
              cpfCnpjHash: 'hash-1',
              razaoSocial: 'Test Company',
              nome: null,
              email: 'test@example.com',
            },
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
        hasMore: false,
      };

      mockDashboardService.getEmails.mockResolvedValue(mockEmails);

      const response = await request(app.getHttpServer())
        .get('/dashboard/emails')
        .set('Authorization', createAuthHeader())
        .set('Authorization', createAuthHeader())
        .expect(200);

      expect(response.body).toEqual(mockEmails);
      expect(mockDashboardService.getEmails).toHaveBeenCalledWith({
        externalId: undefined,
        emailHash: undefined,
        cpfCnpjHash: undefined,
        status: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        companyId: undefined,
        page: 1,
        limit: 50,
      });
    });

    it('should return emails with filters', async () => {
      const mockEmails = {
        emails: [],
        total: 0,
        page: 1,
        limit: 25,
        hasMore: false,
      };

      mockDashboardService.getEmails.mockResolvedValue(mockEmails);

      const response = await request(app.getHttpServer())
        .get('/dashboard/emails')
        .query({
          externalId: 'ext-123',
          emailHash: 'hash-456',
          cpfCnpjHash: 'cpf-hash-789',
          status: 'FAILED',
          dateFrom: '2024-01-01',
          dateTo: '2024-01-31',
          companyId: 'company-123',
          page: 2,
          limit: 25,
        })
        .set('Authorization', createAuthHeader())
        .expect(200);

      expect(response.body).toEqual(mockEmails);
      expect(mockDashboardService.getEmails).toHaveBeenCalledWith({
        externalId: 'ext-123',
        emailHash: 'hash-456',
        cpfCnpjHash: 'cpf-hash-789',
        status: 'FAILED',
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31',
        companyId: 'company-123',
        page: '2',
        limit: '25',
      });
    });
  });

  describe('GET /dashboard/emails/:id', () => {
    it('should return email details by ID', async () => {
      const mockEmailDetail = {
        id: 'email-1',
        outboxId: 'outbox-1',
        externalId: 'ext-1',
        to: 'test@example.com',
        cc: [],
        bcc: [],
        subject: 'Test Email',
        html: '<html>Test</html>',
        replyTo: null,
        headers: null,
        tags: ['test'],
        status: 'SENT',
        sesMessageId: 'ses-123',
        errorCode: null,
        errorReason: null,
        attempts: 1,
        durationMs: 1500,
        requestId: 'req-123',
        createdAt: '2024-01-01T00:00:00Z',
        sentAt: '2024-01-01T00:00:01Z',
        failedAt: null,
        companyId: 'company-1',
        recipient: {
          id: 'recipient-1',
          externalId: 'ext-1',
          cpfCnpjHash: 'hash-1',
          razaoSocial: 'Test Company',
          nome: null,
          email: 'test@example.com',
        },
        events: [
          {
            id: 'event-1',
            type: 'CREATED',
            metadata: { test: 'data' },
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
      };

      mockDashboardService.getEmailById.mockResolvedValue(mockEmailDetail);

      const response = await request(app.getHttpServer())
        .get('/dashboard/emails/email-1')
        .set('Authorization', createAuthHeader())
        .expect(200);

      expect(response.body).toEqual(mockEmailDetail);
      expect(mockDashboardService.getEmailById).toHaveBeenCalledWith('email-1');
    });

    it('should handle email not found', async () => {
      mockDashboardService.getEmailById.mockRejectedValue(new Error('Email not found'));

      await request(app.getHttpServer())
        .get('/dashboard/emails/non-existent')
        .set('Authorization', createAuthHeader())
        .expect(500);
    });
  });

  describe('GET /dashboard/error-breakdown', () => {
    it('should return error breakdown data', async () => {
      const mockErrorBreakdown = {
        totalErrors: 10,
        errorsByCategory: [
          {
            category: 'SES_ERROR',
            count: 5,
            percentage: 50.0,
          },
          {
            category: 'VALIDATION_ERROR',
            count: 3,
            percentage: 30.0,
          },
          {
            category: 'OTHER_ERROR',
            count: 2,
            percentage: 20.0,
          },
        ],
        errorsByCode: [
          {
            code: 'SES_INVALID_EMAIL',
            count: 3,
            percentage: 30.0,
          },
          {
            code: 'SES_RATE_LIMIT',
            count: 2,
            percentage: 20.0,
          },
          {
            code: 'VALIDATION_FAILED',
            count: 3,
            percentage: 30.0,
          },
          {
            code: 'UNKNOWN_ERROR',
            count: 2,
            percentage: 20.0,
          },
        ],
        period: 'today',
      };

      mockDashboardService.getErrorBreakdown.mockResolvedValue(mockErrorBreakdown);

      const response = await request(app.getHttpServer())
        .get('/dashboard/error-breakdown')
        .set('Authorization', createAuthHeader())
        .expect(200);

      expect(response.body).toEqual(mockErrorBreakdown);
      expect(mockDashboardService.getErrorBreakdown).toHaveBeenCalledWith(undefined, undefined);
    });

    it('should return error breakdown with filters', async () => {
      const mockErrorBreakdown = {
        totalErrors: 5,
        errorsByCategory: [
          {
            category: 'SES_ERROR',
            count: 3,
            percentage: 60.0,
          },
          {
            category: 'VALIDATION_ERROR',
            count: 2,
            percentage: 40.0,
          },
        ],
        errorsByCode: [
          {
            code: 'SES_INVALID_EMAIL',
            count: 2,
            percentage: 40.0,
          },
          {
            code: 'SES_RATE_LIMIT',
            count: 1,
            percentage: 20.0,
          },
          {
            code: 'VALIDATION_FAILED',
            count: 2,
            percentage: 40.0,
          },
        ],
        period: 'day',
      };

      mockDashboardService.getErrorBreakdown.mockResolvedValue(mockErrorBreakdown);

      const response = await request(app.getHttpServer())
        .get('/dashboard/error-breakdown')
        .query({ period: 'day', companyId: 'company-123' })
        .set('Authorization', createAuthHeader())
        .expect(200);

      expect(response.body).toEqual(mockErrorBreakdown);
      expect(mockDashboardService.getErrorBreakdown).toHaveBeenCalledWith('day', 'company-123');
    });
  });

  describe('GET /dashboard/overview', () => {
    it('should return dashboard overview', async () => {
      const mockOverview = {
        kpis: {
          totalEmailsToday: 100,
          totalEmailsYesterday: 80,
          successRateToday: 95.5,
          successRateYesterday: 92.0,
          queueDepth: 15,
          averageProcessingTime: 1500,
        },
        queueStatus: {
          pending: 10,
          processing: 5,
          failed: 2,
          dlq: 1,
        },
        recentActivity: [
          {
            id: 'log-1',
            action: 'send_email',
            resource: 'email',
            timestamp: '2024-01-01T00:00:00Z',
            companyId: 'company-1',
          },
        ],
      };

      mockDashboardService.getOverview.mockResolvedValue(mockOverview);

      const response = await request(app.getHttpServer())
        .get('/dashboard/overview')
        .set('Authorization', createAuthHeader())
        .expect(200);

      expect(response.body).toEqual(mockOverview);
      expect(mockDashboardService.getOverview).toHaveBeenCalled();
    });
  });

  describe('GET /dashboard/audit-logs', () => {
    it('should return audit logs with pagination', async () => {
      const mockAuditLogs = {
        logs: [
          {
            id: 'log-1',
            companyId: 'company-1',
            userId: 'user-1',
            action: 'send_email',
            resource: 'email',
            resourceId: 'email-1',
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
            metadata: { test: 'data' },
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      };

      mockDashboardService.getAuditLogs.mockResolvedValue(mockAuditLogs);

      const response = await request(app.getHttpServer())
        .get('/dashboard/audit-logs')
        .set('Authorization', createAuthHeader())
        .expect(200);

      expect(response.body).toEqual(mockAuditLogs);
      expect(mockDashboardService.getAuditLogs).toHaveBeenCalledWith(
        {
          companyId: undefined,
          action: undefined,
          resource: undefined,
          dateFrom: undefined,
          dateTo: undefined,
          page: undefined,
          limit: undefined,
        },
        "admin"
      );
    });

    it('should return audit logs with filters', async () => {
      const mockAuditLogs = {
        logs: [],
        total: 0,
        page: 1,
        limit: 25,
      };

      mockDashboardService.getAuditLogs.mockResolvedValue(mockAuditLogs);

      const response = await request(app.getHttpServer())
        .get('/dashboard/audit-logs')
        .query({
          companyId: 'company-123',
          action: 'send_email',
          resource: 'email',
          dateFrom: '2024-01-01',
          dateTo: '2024-01-31',
          page: 2,
          limit: 25,
        })
        .set('Authorization', createAuthHeader())
        .expect(200);

      expect(response.body).toEqual(mockAuditLogs);
      expect(mockDashboardService.getAuditLogs).toHaveBeenCalledWith(
        {
          companyId: 'company-123',
          action: 'send_email',
          resource: 'email',
          dateFrom: '2024-01-01',
          dateTo: '2024-01-31',
          page: '2',
          limit: '25',
        },
        "admin"
      );
    });
  });

  describe('GET /dashboard/rate-limit-stats', () => {
    it('should return rate limit statistics', async () => {
      const mockRateLimitStats = {
        activeCompanies: 5,
        totalRequestsToday: 1000,
        rateLimitViolations: 10,
        topCompanies: [
          {
            companyId: 'company-1',
            companyName: 'Company 1',
            requestCount: 500,
          },
          {
            companyId: 'company-2',
            companyName: 'Company 2',
            requestCount: 300,
          },
        ],
      };

      mockDashboardService.getRateLimitStats.mockResolvedValue(mockRateLimitStats);

      const response = await request(app.getHttpServer())
        .get('/dashboard/rate-limit-stats')
        .set('Authorization', createAuthHeader())
        .expect(200);

      expect(response.body).toEqual(mockRateLimitStats);
      expect(mockDashboardService.getRateLimitStats).toHaveBeenCalled();
    });
  });

  describe('GET /dashboard/companies', () => {
    it('should return companies list', async () => {
      const mockCompanies = [
        {
          id: 'company-1',
          name: 'Test Company',
          apiKeyPrefix: 'sk_test_',
          isActive: true,
          lastUsedAt: '2024-01-01T00:00:00Z',
          expiresAt: '2024-12-31T23:59:59Z',
          isExpired: false,
          isNearExpiration: false,
          allowedIps: ['192.168.1.1'],
        },
      ];

      mockDashboardService.getCompanies.mockResolvedValue(mockCompanies);

      const response = await request(app.getHttpServer())
        .get('/dashboard/companies')
        .set('Authorization', createAuthHeader())
        .expect(200);

      expect(response.body).toEqual(mockCompanies);
      expect(mockDashboardService.getCompanies).toHaveBeenCalled();
    });
  });

  describe('GET /dashboard/api-key-status', () => {
    it('should return API key status', async () => {
      const mockApiKeyStatus = {
        totalKeys: 3,
        expiredKeys: 1,
        nearExpirationKeys: 1,
        inactiveKeys: 0,
        warnings: [
          {
            companyId: 'company-1',
            companyName: 'Expired Company',
            type: 'expired',
            message: 'API key has expired',
          },
          {
            companyId: 'company-2',
            companyName: 'Near Expiration Company',
            type: 'near_expiration',
            message: 'API key expires soon',
          },
        ],
      };

      mockDashboardService.getApiKeyStatus.mockResolvedValue(mockApiKeyStatus);

      const response = await request(app.getHttpServer())
        .get('/dashboard/api-key-status')
        .set('Authorization', createAuthHeader())
        .expect(200);

      expect(response.body).toEqual(mockApiKeyStatus);
      expect(mockDashboardService.getApiKeyStatus).toHaveBeenCalled();
    });
  });

  describe('GET /dashboard/metrics', () => {
    it('should return real-time metrics', async () => {
      const mockMetrics = {
        queue_depth: 15,
        queue_age_p95: 120000,
        send_latency_p50: 1000,
        send_latency_p95: 2000,
        send_latency_p99: 3000,
        error_rate: 2.5,
        dlq_depth: 3,
        tenant_fairness_ratio: 1.2,
        error_breakdown: {
          'SES_INVALID_EMAIL': 5,
          'VALIDATION_FAILED': 3,
          'RATE_LIMIT_EXCEEDED': 2,
        },
      };

      mockDashboardService.getMetrics.mockResolvedValue(mockMetrics);

      const response = await request(app.getHttpServer())
        .get('/dashboard/metrics')
        .set('Authorization', createAuthHeader())
        .expect(200);

      expect(response.body).toEqual(mockMetrics);
      expect(mockDashboardService.getMetrics).toHaveBeenCalled();
    });
  });
});
