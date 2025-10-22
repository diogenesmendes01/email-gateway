import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DashboardService } from './dashboard.service';
import { AuthService } from '../auth/auth.service';
import { prisma } from '@email-gateway/database';

// Mock Prisma
jest.mock('@email-gateway/database', () => ({
  prisma: {
    emailLog: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    emailOutbox: {
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    company: {
      findMany: jest.fn(),
    },
  },
}));

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    zrangebyscore: jest.fn(),
    hvals: jest.fn(),
    hgetall: jest.fn(),
  }));
});

describe('DashboardService', () => {
  let service: DashboardService;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: AuthService,
          useValue: {
            isApiKeyExpired: jest.fn(),
            isApiKeyNearExpiration: jest.fn(),
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

    service = module.get<DashboardService>(DashboardService);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getKPIs', () => {
    it('should return KPIs for today period', async () => {
      // Mock data
      const mockEmailStats = [
        { status: 'SENT', _count: { id: 100 } },
        { status: 'FAILED', _count: { id: 5 } },
      ];

      const mockLatencies = [
        { durationMs: 1000 },
        { durationMs: 2000 },
        { durationMs: 1500 },
      ];

      // Mock Prisma calls
      (prisma.emailLog.groupBy as jest.Mock).mockResolvedValue(mockEmailStats);
      (prisma.emailLog.findMany as jest.Mock).mockResolvedValue(mockLatencies);
      (prisma.emailOutbox.count as jest.Mock).mockResolvedValue(2);

      const result = await service.getKPIs('today');

      expect(result).toMatchObject({
        totalEnviados: expect.any(Number),
        taxaSucesso: expect.any(Number),
        totalErros: expect.any(Number),
        dlqCount: 2,
        latenciaMedia: expect.any(Number),
        periodo: 'today',
        comparacao: {
          enviados: expect.any(Number),
          sucesso: expect.any(Number),
          erros: expect.any(Number),
        },
      });

      expect(result.totalEnviados).toBe(105); // 100 + 5
      expect(result.taxaSucesso).toBeCloseTo(95.24, 1); // 100/105 * 100
      expect(result.totalErros).toBe(5);
    });

    it('should return KPIs for specific company', async () => {
      const mockEmailStats = [
        { status: 'SENT', _count: { id: 50 } },
        { status: 'FAILED', _count: { id: 2 } },
      ];

      (prisma.emailLog.groupBy as jest.Mock).mockResolvedValue(mockEmailStats);
      (prisma.emailLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.emailOutbox.count as jest.Mock).mockResolvedValue(0);

      const result = await service.getKPIs('today', 'company-123');

      expect(result).toMatchObject({
        totalEnviados: 52,
        taxaSucesso: expect.any(Number),
        totalErros: 2,
      });
    });

    it('should handle empty data gracefully', async () => {
      (prisma.emailLog.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.emailLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.emailOutbox.count as jest.Mock).mockResolvedValue(0);

      const result = await service.getKPIs('today');

      expect(result.totalEnviados).toBe(0);
      expect(result.taxaSucesso).toBe(0);
      expect(result.totalErros).toBe(0);
    });
  });

  describe('getEmails', () => {
    it('should return emails with pagination', async () => {
      const mockEmails = [
        {
          id: 'email-1',
          to: 'test@example.com',
          subject: 'Test Email',
          status: 'SENT',
          createdAt: new Date(),
          sentAt: new Date(),
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
      ];

      (prisma.emailLog.findMany as jest.Mock).mockResolvedValue(mockEmails);
      (prisma.emailLog.count as jest.Mock).mockResolvedValue(1);

      const result = await service.getEmails({
        page: 1,
        limit: 50,
      });

      expect(result).toMatchObject({
        emails: expect.arrayContaining([
          expect.objectContaining({
            id: 'email-1',
            to: 'test@example.com',
            subject: 'Test Email',
            status: 'SENT',
          }),
        ]),
        total: 1,
        page: 1,
        limit: 50,
        hasMore: false,
      });
    });

    it('should filter emails by status', async () => {
      (prisma.emailLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.emailLog.count as jest.Mock).mockResolvedValue(0);

      await service.getEmails({
        status: 'FAILED',
        page: 1,
        limit: 50,
      });

      expect(prisma.emailLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'FAILED',
          }),
        })
      );
    });

    it('should filter emails by date range', async () => {
      (prisma.emailLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.emailLog.count as jest.Mock).mockResolvedValue(0);

      await service.getEmails({
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31',
        page: 1,
        limit: 50,
      });

      expect(prisma.emailLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: new Date('2024-01-01'),
              lte: new Date('2024-01-31'),
            }),
          }),
        })
      );
    });
  });

  describe('getEmailById', () => {
    it('should return email details with events', async () => {
      const mockEmail = {
        id: 'email-1',
        outboxId: 'outbox-1',
        to: 'test@example.com',
        subject: 'Test Email',
        status: 'SENT',
        createdAt: new Date(),
        sentAt: new Date(),
        failedAt: null,
        errorCode: null,
        errorReason: null,
        attempts: 1,
        durationMs: 1500,
        requestId: 'req-1',
        companyId: 'company-1',
        recipient: {
          id: 'recipient-1',
          externalId: 'ext-1',
          cpfCnpjHash: 'hash-1',
          razaoSocial: 'Test Company',
          nome: null,
          email: 'test@example.com',
        },
        outbox: {
          id: 'outbox-1',
          externalId: 'ext-1',
          cc: [],
          bcc: [],
          html: '<html>Test</html>',
          replyTo: null,
          headers: null,
          tags: ['test'],
        },
        events: [
          {
            id: 'event-1',
            type: 'CREATED',
            metadata: { test: 'data' },
            createdAt: new Date(),
          },
        ],
      };

      (prisma.emailLog.findUnique as jest.Mock).mockResolvedValue(mockEmail);

      const result = await service.getEmailById('email-1');

      expect(result).toMatchObject({
        id: 'email-1',
        outboxId: 'outbox-1',
        to: 'test@example.com',
        subject: 'Test Email',
        status: 'SENT',
        events: expect.arrayContaining([
          expect.objectContaining({
            id: 'event-1',
            type: 'CREATED',
          }),
        ]),
      });
    });

    it('should throw error when email not found', async () => {
      (prisma.emailLog.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getEmailById('non-existent')).rejects.toThrow('Email not found');
    });
  });

  describe('getErrorBreakdown', () => {
    it('should return error breakdown by category and code', async () => {
      const mockErrors = [
        { errorCode: 'SES_INVALID_EMAIL', errorReason: 'Invalid email' },
        { errorCode: 'SES_RATE_LIMIT', errorReason: 'Rate limit exceeded' },
        { errorCode: 'VALIDATION_FAILED', errorReason: 'Validation error' },
        { errorCode: 'UNKNOWN_ERROR', errorReason: 'Unknown error' },
      ];

      (prisma.emailLog.findMany as jest.Mock).mockResolvedValue(mockErrors);

      const result = await service.getErrorBreakdown('today');

      expect(result).toMatchObject({
        totalErrors: 4,
        errorsByCategory: expect.arrayContaining([
          expect.objectContaining({
            category: 'SES_ERROR',
            count: 2, // SES_INVALID_EMAIL + SES_RATE_LIMIT
          }),
          expect.objectContaining({
            category: 'VALIDATION_ERROR',
            count: 1,
          }),
          expect.objectContaining({
            category: 'OTHER_ERROR',
            count: 1,
          }),
        ]),
        errorsByCode: expect.arrayContaining([
          expect.objectContaining({
            code: 'SES_INVALID_EMAIL',
            count: 1,
          }),
        ]),
        period: 'today',
      });
    });

    it('should handle empty errors gracefully', async () => {
      (prisma.emailLog.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getErrorBreakdown('today');

      expect(result).toMatchObject({
        totalErrors: 0,
        errorsByCategory: [],
        errorsByCode: [],
        period: 'today',
      });
    });
  });

  describe('getOverview', () => {
    it('should return dashboard overview', async () => {
      const mockTodayStats = [
        { status: 'SENT', _count: { id: 100 } },
        { status: 'FAILED', _count: { id: 5 } },
      ];

      const mockYesterdayStats = [
        { status: 'SENT', _count: { id: 80 } },
        { status: 'FAILED', _count: { id: 3 } },
      ];

      const mockQueueStats = [
        { status: 'PENDING', _count: { id: 10 } },
        { status: 'PROCESSING', _count: { id: 5 } },
        { status: 'FAILED', _count: { id: 2 } },
      ];

      const mockRecentActivity = [
        {
          id: 'log-1',
          action: 'send_email',
          resource: 'email',
          createdAt: new Date(),
          companyId: 'company-1',
        },
      ];

      (prisma.emailLog.groupBy as jest.Mock)
        .mockResolvedValueOnce(mockTodayStats)
        .mockResolvedValueOnce(mockYesterdayStats);
      (prisma.emailOutbox.groupBy as jest.Mock).mockResolvedValue(mockQueueStats);
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockRecentActivity);
      (prisma.emailLog.aggregate as jest.Mock).mockResolvedValue({ _avg: { durationMs: 1500 } });

      const result = await service.getOverview();

      expect(result).toMatchObject({
        kpis: expect.objectContaining({
          totalEmailsToday: 105,
          totalEmailsYesterday: 83,
          successRateToday: expect.any(Number),
          successRateYesterday: expect.any(Number),
          queueDepth: 15, // 10 + 5
          averageProcessingTime: 1500,
        }),
        queueStatus: expect.objectContaining({
          pending: 10,
          processing: 5,
          failed: 2,
        }),
        recentActivity: expect.arrayContaining([
          expect.objectContaining({
            id: 'log-1',
            action: 'send_email',
          }),
        ]),
      });
    });
  });

  describe('getCompanies', () => {
    it('should return companies with API key status', async () => {
      const mockCompanies = [
        {
          id: 'company-1',
          name: 'Test Company',
          apiKeyPrefix: 'sk_test_',
          isActive: true,
          lastUsedAt: new Date(),
          apiKeyExpiresAt: new Date(Date.now() + 86400000), // 1 day from now
          allowedIps: ['192.168.1.1'],
        },
      ];

      (prisma.company.findMany as jest.Mock).mockResolvedValue(mockCompanies);
      (authService.isApiKeyExpired as jest.Mock).mockReturnValue(false);
      (authService.isApiKeyNearExpiration as jest.Mock).mockReturnValue(false);

      const result = await service.getCompanies();

      expect(result).toMatchObject([
        expect.objectContaining({
          id: 'company-1',
          name: 'Test Company',
          apiKeyPrefix: 'sk_test_',
          isActive: true,
          isExpired: false,
          isNearExpiration: false,
          allowedIps: ['192.168.1.1'],
        }),
      ]);
    });
  });

  describe('getApiKeyStatus', () => {
    it('should return API key status with warnings', async () => {
      const mockCompanies = [
        {
          id: 'company-1',
          name: 'Active Company',
          apiKeyPrefix: 'sk_test_',
          isActive: true,
          lastUsedAt: new Date(),
          apiKeyExpiresAt: new Date(Date.now() + 86400000),
        },
        {
          id: 'company-2',
          name: 'Expired Company',
          apiKeyPrefix: 'sk_expired_',
          isActive: true,
          lastUsedAt: new Date(),
          apiKeyExpiresAt: new Date(Date.now() - 86400000), // Expired
        },
        {
          id: 'company-3',
          name: 'Inactive Company',
          apiKeyPrefix: 'sk_inactive_',
          isActive: false,
          lastUsedAt: null,
          apiKeyExpiresAt: new Date(Date.now() + 86400000),
        },
      ];

      (prisma.company.findMany as jest.Mock).mockResolvedValue(mockCompanies);
      (authService.isApiKeyExpired as jest.Mock)
        .mockReturnValueOnce(false) // company-1
        .mockReturnValueOnce(true)  // company-2
        .mockReturnValueOnce(false); // company-3
      (authService.isApiKeyNearExpiration as jest.Mock).mockReturnValue(false);

      const result = await service.getApiKeyStatus();

      expect(result).toMatchObject({
        totalKeys: 3,
        expiredKeys: 1,
        nearExpirationKeys: 0,
        inactiveKeys: 1,
        warnings: expect.arrayContaining([
          expect.objectContaining({
            companyId: 'company-2',
            type: 'expired',
            message: 'API key has expired',
          }),
          expect.objectContaining({
            companyId: 'company-3',
            type: 'inactive',
            message: 'API key is inactive',
          }),
        ]),
      });
    });
  });

  describe('getRateLimitStats', () => {
    it('should return rate limit statistics', async () => {
      const mockAuditLogs = [
        {
          companyId: 'company-1',
          company: { name: 'Company 1' },
        },
        {
          companyId: 'company-1',
          company: { name: 'Company 1' },
        },
        {
          companyId: 'company-2',
          company: { name: 'Company 2' },
        },
      ];

      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockAuditLogs);
      (prisma.auditLog.count as jest.Mock).mockResolvedValue(0);

      const result = await service.getRateLimitStats();

      expect(result).toMatchObject({
        activeCompanies: 2,
        totalRequestsToday: 3,
        rateLimitViolations: 0,
        topCompanies: expect.arrayContaining([
          expect.objectContaining({
            companyId: 'company-1',
            companyName: 'Company 1',
            requestCount: 2,
          }),
          expect.objectContaining({
            companyId: 'company-2',
            companyName: 'Company 2',
            requestCount: 1,
          }),
        ]),
      });
    });
  });

  describe('getAuditLogs', () => {
    it('should return audit logs with pagination', async () => {
      const mockLogs = [
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
          createdAt: new Date(),
        },
      ];

      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockLogs);
      (prisma.auditLog.count as jest.Mock).mockResolvedValue(1);

      const result = await service.getAuditLogs({
        page: 1,
        limit: 50,
      }, 'user-1');

      expect(result).toMatchObject({
        logs: expect.arrayContaining([
          expect.objectContaining({
            id: 'log-1',
            action: 'send_email',
            resource: 'email',
          }),
        ]),
        total: 1,
        page: 1,
        limit: 50,
      });
    });

    it('should filter audit logs by company', async () => {
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.auditLog.count as jest.Mock).mockResolvedValue(0);

      await service.getAuditLogs({
        companyId: 'company-1',
        page: 1,
        limit: 50,
      }, 'user-1');

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'company-1',
          }),
        })
      );
    });
  });

  describe('getEmails with sorting - TASK 9.2', () => {
    it('should apply sorting by createdAt desc', async () => {
      const mockEmails = [
        { id: 'email-1', status: 'SENT', createdAt: new Date(), attempts: 1, recipient: null, outbox: null },
      ];

      (prisma.emailLog.findMany as jest.Mock).mockResolvedValue(mockEmails);
      (prisma.emailLog.count as jest.Mock).mockResolvedValue(1);

      await service.getEmails({
        page: 1,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(prisma.emailLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should apply sorting by status asc', async () => {
      (prisma.emailLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.emailLog.count as jest.Mock).mockResolvedValue(0);

      await service.getEmails({
        page: 1,
        limit: 50,
        sortBy: 'status',
        sortOrder: 'asc',
      });

      expect(prisma.emailLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { status: 'asc' },
        })
      );
    });

    it('should default to createdAt desc if no sorting provided', async () => {
      (prisma.emailLog.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.emailLog.count as jest.Mock).mockResolvedValue(0);

      await service.getEmails({
        page: 1,
        limit: 50,
      });

      expect(prisma.emailLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });

  describe('exportEmailsToCSV - TASK 9.2', () => {
    it('should export emails with masking and watermark', async () => {
      const mockEmails = [
        {
          id: 'email-1',
          to: 'john@example.com',
          subject: 'Test Subject',
          status: 'SENT',
          createdAt: new Date('2024-01-01'),
          sentAt: new Date('2024-01-01'),
          failedAt: null,
          errorCode: null,
          errorReason: null,
          attempts: 1,
          durationMs: 1000,
          sesMessageId: 'ses-123',
          requestId: 'req-123',
          recipient: {
            externalId: 'ext-1',
            cpfCnpjHash: '12345678900',
            razaoSocial: 'Test Company',
            nome: 'John Doe',
            email: 'john@example.com',
          },
          outbox: {
            externalId: 'outbox-ext-1',
          },
        },
      ];

      (prisma.emailLog.count as jest.Mock).mockResolvedValue(1);
      (prisma.emailLog.findMany as jest.Mock).mockResolvedValue(mockEmails);

      const result = await service.exportEmailsToCSV(
        { status: 'SENT' },
        'test-user',
        '192.168.1.1'
      );

      expect(result).toHaveProperty('csv');
      expect(result).toHaveProperty('filename');
      expect(result.csv).toContain('Exported by test-user from IP 192.168.1.1 at');
      expect(result.csv).toContain('Total records: 1');
      expect(result.csv).toContain('ID,External ID,To (Masked)');
      expect(result.csv).toContain('j***@example.com'); // Masked email
      expect(result.filename).toMatch(/emails-export-\d+\.csv/);
    });

    it('should reject export if exceeds 10k limit', async () => {
      (prisma.emailLog.count as jest.Mock).mockResolvedValue(10001);

      await expect(
        service.exportEmailsToCSV({}, 'test-user')
      ).rejects.toThrow('Export exceeds maximum limit');
    });

    it('should handle CSV field escaping', async () => {
      const mockEmails = [
        {
          id: 'email-1',
          to: 'test@example.com',
          subject: 'Subject with, comma',
          status: 'SENT',
          createdAt: new Date(),
          sentAt: null,
          failedAt: null,
          errorCode: null,
          errorReason: 'Error with "quotes" and, comma',
          attempts: 1,
          durationMs: null,
          sesMessageId: null,
          requestId: null,
          recipient: null,
          outbox: null,
        },
      ];

      (prisma.emailLog.count as jest.Mock).mockResolvedValue(1);
      (prisma.emailLog.findMany as jest.Mock).mockResolvedValue(mockEmails);

      const result = await service.exportEmailsToCSV({}, 'test-user', '192.168.1.1');

      expect(result.csv).toContain('"Subject with, comma"');
      expect(result.csv).toContain('"Error with ""quotes"" and, comma"');
    });

    it('should apply filters in export', async () => {
      (prisma.emailLog.count as jest.Mock).mockResolvedValue(0);
      (prisma.emailLog.findMany as jest.Mock).mockResolvedValue([]);

      await service.exportEmailsToCSV(
        {
          status: 'FAILED',
          companyId: 'company-1',
          dateFrom: '2024-01-01',
          dateTo: '2024-01-31',
        },
        'test-user',
        '192.168.1.1'
      );

      expect(prisma.emailLog.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'FAILED',
            companyId: 'company-1',
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        })
      );
    });
  });
});
