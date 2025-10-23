import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DashboardService } from '../../src/modules/dashboard/dashboard.service';
import { AuthService } from '../../src/modules/auth/auth.service';
import { prisma } from '@email-gateway/database';
import Redis from 'ioredis';

describe('Cursor Paging, Partitioning and Fairness MVP (Unit)', () => {
  let dashboardService: DashboardService;
  let authService: AuthService;
  let configService: ConfigService;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(async () => {
    const mockRedisInstance = {
      get: jest.fn(),
      set: jest.fn(),
      incr: jest.fn(),
      zadd: jest.fn(),
      zrange: jest.fn(),
      hgetall: jest.fn(),
      del: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: AuthService,
          useValue: {
            validateApiKey: jest.fn(),
            validateBasicAuth: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: mockRedisInstance,
        },
      ],
    }).compile();

    dashboardService = module.get<DashboardService>(DashboardService);
    authService = module.get<AuthService>(AuthService);
    configService = module.get<ConfigService>(ConfigService);
    mockRedis = mockRedisInstance;
  });

  describe('Cursor-based Pagination', () => {
    it('should generate cursor from email log data', () => {
      // Arrange
      const emailLog = {
        id: 'test-id-123',
        createdAt: new Date('2025-01-20T10:00:00Z'),
        companyId: 'company-456',
      };

      // Act
      const cursor = dashboardService.generateCursor(emailLog);

      // Assert
      expect(cursor).toBeDefined();
      expect(typeof cursor).toBe('string');
      
      // Decode and verify cursor structure
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
      expect(decoded.id).toBe('test-id-123');
      expect(decoded.createdAt).toBe('2025-01-20T10:00:00.000Z');
      expect(decoded.companyId).toBe('company-456');
    });

    it('should parse cursor correctly', () => {
      // Arrange
      const originalData = {
        id: 'test-id-123',
        createdAt: '2025-01-20T10:00:00.000Z',
        companyId: 'company-456',
      };
      const cursor = Buffer.from(JSON.stringify(originalData)).toString('base64');

      // Act
      const parsed = dashboardService.parseCursor(cursor);

      // Assert
      expect(parsed).toEqual(originalData);
    });

    it('should handle invalid cursor gracefully', () => {
      // Arrange
      const invalidCursor = 'invalid-base64-string';

      // Act & Assert
      expect(() => dashboardService.parseCursor(invalidCursor)).toThrow('Invalid cursor format');
    });

    it('should build pagination query with cursor', async () => {
      // Arrange
      const cursor = {
        id: 'test-id-123',
        createdAt: '2025-01-20T10:00:00.000Z',
        companyId: 'company-456',
      };
      const limit = 10;

      // Act
      const query = dashboardService.buildCursorQuery(cursor, limit);

      // Assert
      expect(query).toEqual({
        where: {
          AND: [
            {
              OR: [
                {
                  createdAt: {
                    lt: new Date('2025-01-20T10:00:00.000Z'),
                  },
                },
                {
                  AND: [
                    {
                      createdAt: new Date('2025-01-20T10:00:00.000Z'),
                    },
                    {
                      id: {
                        lt: 'test-id-123',
                      },
                    },
                  ],
                },
              ],
            },
            {
              companyId: 'company-456',
            },
          ],
        },
        orderBy: [
          {
            createdAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
        take: limit + 1, // +1 to check hasMore
      });
    });
  });

  describe('Company Partitioning', () => {
    it('should calculate company priority based on volume', () => {
      // Arrange
      const companyStats = {
        'company-1': { totalEmails: 1000, lastProcessed: Date.now() - 60000 },
        'company-2': { totalEmails: 500, lastProcessed: Date.now() - 30000 },
        'company-3': { totalEmails: 2000, lastProcessed: Date.now() - 120000 },
      };

      // Act
      const priorities = Object.keys(companyStats).map(companyId => ({
        companyId,
        priority: dashboardService.calculateCompanyPriority(companyId, companyStats[companyId]),
      }));

      // Assert
      // Company with highest volume should have lowest priority (processed first)
      expect(priorities.find(p => p.companyId === 'company-3').priority).toBeLessThan(
        priorities.find(p => p.companyId === 'company-1').priority
      );
    });

    it('should calculate fairness delay between companies', () => {
      // Arrange
      const companyId = 'company-1';
      const lastProcessed = Date.now() - 50000; // 50 seconds ago
      const minDelay = 1000; // 1 second minimum

      // Act
      const delay = dashboardService.calculateFairnessDelay(companyId, lastProcessed, minDelay);

      // Assert
      expect(delay).toBe(0); // No delay needed since enough time has passed
    });

    it('should enforce minimum delay for fairness', () => {
      // Arrange
      const companyId = 'company-1';
      const lastProcessed = Date.now() - 500; // 500ms ago
      const minDelay = 1000; // 1 second minimum

      // Act
      const delay = dashboardService.calculateFairnessDelay(companyId, lastProcessed, minDelay);

      // Assert
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(minDelay);
    });

    it('should partition jobs by company correctly', () => {
      // Arrange
      const jobs = [
        { id: 'job-1', companyId: 'company-1', priority: 1 },
        { id: 'job-2', companyId: 'company-2', priority: 2 },
        { id: 'job-3', companyId: 'company-1', priority: 1 },
        { id: 'job-4', companyId: 'company-3', priority: 3 },
      ];

      // Act
      const partitioned = dashboardService.partitionJobsByCompany(jobs);

      // Assert
      expect(partitioned['company-1']).toHaveLength(2);
      expect(partitioned['company-2']).toHaveLength(1);
      expect(partitioned['company-3']).toHaveLength(1);
    });
  });

  describe('Fairness Round-robin', () => {
    it('should implement round-robin processing order', () => {
      // Arrange
      const companies = ['company-1', 'company-2', 'company-3'];
      const jobs = [
        { id: 'job-1', companyId: 'company-1' },
        { id: 'job-2', companyId: 'company-2' },
        { id: 'job-3', companyId: 'company-3' },
        { id: 'job-4', companyId: 'company-1' },
        { id: 'job-5', companyId: 'company-2' },
      ];

      // Act
      const roundRobinOrder = dashboardService.calculateRoundRobinOrder(jobs, companies);

      // Assert
      expect(roundRobinOrder).toEqual([
        { id: 'job-1', companyId: 'company-1' },
        { id: 'job-2', companyId: 'company-2' },
        { id: 'job-3', companyId: 'company-3' },
        { id: 'job-4', companyId: 'company-1' },
        { id: 'job-5', companyId: 'company-2' },
      ]);
    });

    it('should handle empty company list gracefully', () => {
      // Arrange
      const companies: string[] = [];
      const jobs = [{ id: 'job-1', companyId: 'company-1' }];

      // Act
      const roundRobinOrder = dashboardService.calculateRoundRobinOrder(jobs, companies);

      // Assert
      expect(roundRobinOrder).toEqual(jobs); // Should return original order
    });

    it('should calculate fairness ratio between companies', () => {
      // Arrange
      const companyStats = {
        'company-1': { processed: 100, total: 1000 },
        'company-2': { processed: 50, total: 500 },
        'company-3': { processed: 200, total: 2000 },
      };

      // Act
      const fairnessRatio = dashboardService.calculateFairnessRatio(companyStats);

      // Assert
      expect(fairnessRatio).toBeCloseTo(1.0, 1); // Should be close to 1.0 (fair)
    });

    it('should detect unfairness when companies have different processing ratios', () => {
      // Arrange
      const companyStats = {
        'company-1': { processed: 100, total: 1000 }, // 10%
        'company-2': { processed: 200, total: 500 },  // 40%
        'company-3': { processed: 50, total: 2000 },  // 2.5%
      };

      // Act
      const fairnessRatio = dashboardService.calculateFairnessRatio(companyStats);

      // Assert
      expect(fairnessRatio).toBeLessThan(0.5); // Should indicate unfairness
    });
  });

  describe('Performance Optimization', () => {
    it('should validate cursor pagination performance', async () => {
      // Arrange
      const startTime = Date.now();
      const cursor = {
        id: 'test-id-123',
        createdAt: '2025-01-20T10:00:00.000Z',
        companyId: 'company-456',
      };

      // Act
      const query = dashboardService.buildCursorQuery(cursor, 50);
      const buildTime = Date.now() - startTime;

      // Assert
      expect(buildTime).toBeLessThan(10); // Should build query in < 10ms
      expect(query.take).toBe(51); // Should take limit + 1
    });

    it('should optimize database indexes for cursor pagination', () => {
      // Arrange
      const expectedIndexes = [
        'idx_email_logs_cursor',
        'idx_email_logs_company_cursor',
        'idx_email_outbox_company_status',
      ];

      // Act
      const recommendedIndexes = dashboardService.getRecommendedIndexes();

      // Assert
      expectedIndexes.forEach(index => {
        expect(recommendedIndexes).toContain(index);
      });
    });

    it('should validate fairness overhead is minimal', () => {
      // Arrange
      const companies = ['company-1', 'company-2', 'company-3'];
      const jobs = Array(1000).fill(null).map((_, i) => ({
        id: `job-${i}`,
        companyId: companies[i % companies.length],
      }));

      // Act
      const startTime = Date.now();
      dashboardService.calculateRoundRobinOrder(jobs, companies);
      const processingTime = Date.now() - startTime;

      // Assert
      expect(processingTime).toBeLessThan(100); // Should process 1000 jobs in < 100ms
    });
  });

  describe('Configuration Validation', () => {
    it('should validate cursor pagination configuration', () => {
      // Arrange
      const config = {
        CURSOR_PAGINATION_ENABLED: 'true',
        CURSOR_PAGINATION_DEFAULT_LIMIT: '50',
        CURSOR_PAGINATION_MAX_LIMIT: '1000',
        FAIRNESS_MIN_DELAY_MS: '100',
        FAIRNESS_MONITORING_ENABLED: 'true',
      };

      // Act & Assert
      Object.entries(config).forEach(([key, value]) => {
        expect(configService.get).toHaveBeenCalledWith(key);
      });
    });

    it('should validate fairness configuration', () => {
      // Arrange
      const fairnessConfig = {
        FAIRNESS_MIN_DELAY_MS: 100,
        FAIRNESS_MONITORING_ENABLED: true,
        FAIRNESS_ALERT_THRESHOLD: 0.8,
      };

      // Act
      const isValid = dashboardService.validateFairnessConfig(fairnessConfig);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should reject invalid fairness configuration', () => {
      // Arrange
      const invalidConfig = {
        FAIRNESS_MIN_DELAY_MS: -100, // Invalid negative delay
        FAIRNESS_MONITORING_ENABLED: true,
        FAIRNESS_ALERT_THRESHOLD: 1.5, // Invalid threshold > 1
      };

      // Act
      const isValid = dashboardService.validateFairnessConfig(invalidConfig);

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('MVP Scope Validation', () => {
    it('should confirm cursor pagination is implemented for MVP', () => {
      // Arrange
      const mvpFeatures = dashboardService.getMVPFeatures();

      // Act & Assert
      expect(mvpFeatures.cursorPagination).toBe(true);
      expect(mvpFeatures.companyPartitioning).toBe(true);
      expect(mvpFeatures.fairnessRoundRobin).toBe(true);
    });

    it('should confirm advanced features are not implemented in MVP', () => {
      // Arrange
      const mvpFeatures = dashboardService.getMVPFeatures();

      // Act & Assert
      expect(mvpFeatures.advancedPartitioning).toBe(false);
      expect(mvpFeatures.dynamicFairness).toBe(false);
      expect(mvpFeatures.multiRegionSupport).toBe(false);
    });

    it('should validate MVP performance requirements', () => {
      // Arrange
      const performanceRequirements = {
        cursorBuildTime: '< 10ms',
        fairnessOverhead: '< 100ms per 1000 jobs',
        paginationQueryTime: '< 50ms',
      };

      // Act
      const isValid = dashboardService.validateMVPPerformanceRequirements(performanceRequirements);

      // Assert
      expect(isValid).toBe(true);
    });
  });
});
