import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DashboardService } from '../../src/modules/dashboard/dashboard.service';

describe('Cursor Paging, Partitioning and Fairness MVP (Integration)', () => {
  let app: INestApplication;
  let dashboardService: DashboardService;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    
    dashboardService = moduleFixture.get<DashboardService>(DashboardService);
    configService = moduleFixture.get<ConfigService>(ConfigService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Cursor-based Pagination Integration', () => {
    let validAuthHeader: string;

    beforeEach(() => {
      const validCredentials = Buffer.from('admin:password').toString('base64');
      validAuthHeader = `Basic ${validCredentials}`;
    });

    it('should support cursor-based pagination in dashboard emails endpoint', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/emails')
        .set('Authorization', validAuthHeader)
        .query({ limit: 10 })
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('hasMore');
      expect(response.body).toHaveProperty('cursor');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should handle cursor pagination with company filter', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/emails')
        .set('Authorization', validAuthHeader)
        .query({ 
          limit: 5, 
          companyId: 'test-company',
          cursor: Buffer.from(JSON.stringify({
            id: 'test-id',
            createdAt: '2025-01-20T10:00:00.000Z',
            companyId: 'test-company'
          })).toString('base64')
        })
        .expect(200);

      // Assert
      expect(response.body.data).toBeDefined();
      expect(response.body.hasMore).toBeDefined();
      
      // All returned emails should belong to the specified company
      response.body.data.forEach((email: any) => {
        expect(email.companyId).toBe('test-company');
      });
    });

    it('should maintain cursor pagination performance with large datasets', async () => {
      // Arrange
      const startTime = Date.now();

      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/emails')
        .set('Authorization', validAuthHeader)
        .query({ limit: 100 })
        .expect(200);

      // Assert
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond in < 1 second
      expect(response.body.data).toBeDefined();
    });

    it('should handle invalid cursor gracefully', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/emails')
        .set('Authorization', validAuthHeader)
        .query({ 
          limit: 10,
          cursor: 'invalid-cursor'
        })
        .expect(400);

      // Assert
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Invalid cursor');
    });
  });

  describe('Company Partitioning Integration', () => {
    let validAuthHeader: string;

    beforeEach(() => {
      const validCredentials = Buffer.from('admin:password').toString('base64');
      validAuthHeader = `Basic ${validCredentials}`;
    });

    it('should partition emails by company in dashboard', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/emails')
        .set('Authorization', validAuthHeader)
        .query({ 
          limit: 20,
          companyId: 'company-1'
        })
        .expect(200);

      // Assert
      expect(response.body.data).toBeDefined();
      
      // All emails should belong to the specified company
      response.body.data.forEach((email: any) => {
        expect(email.companyId).toBe('company-1');
      });
    });

    it('should support multiple company queries efficiently', async () => {
      // Arrange
      const companies = ['company-1', 'company-2', 'company-3'];
      const promises = companies.map(companyId =>
        request(app.getHttpServer())
          .get('/dashboard/emails')
          .set('Authorization', validAuthHeader)
          .query({ limit: 10, companyId })
      );

      // Act
      const responses = await Promise.all(promises);

      // Assert
      responses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
        
        response.body.data.forEach((email: any) => {
          expect(email.companyId).toBe(companies[index]);
        });
      });
    });

    it('should handle company-specific metrics correctly', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/kpis')
        .set('Authorization', validAuthHeader)
        .query({ companyId: 'company-1' })
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('totalSent');
      expect(response.body).toHaveProperty('totalFailed');
      expect(response.body).toHaveProperty('successRate');
      expect(response.body).toHaveProperty('companyId', 'company-1');
    });
  });

  describe('Fairness Round-robin Integration', () => {
    it('should process jobs with fairness between companies', async () => {
      // Arrange
      const companies = ['company-1', 'company-2', 'company-3'];
      const jobs = companies.map((companyId, index) => ({
        id: `job-${index}`,
        companyId,
        priority: index + 1,
      }));

      // Act
      const response = await request(app.getHttpServer())
        .post('/dashboard/jobs/process-fairness')
        .set('Authorization', `Basic ${Buffer.from('admin:password').toString('base64')}`)
        .send({ jobs, companies })
        .expect(200);

      // Assert
      expect(response.body.processedJobs).toBeDefined();
      expect(response.body.fairnessRatio).toBeDefined();
      expect(response.body.fairnessRatio).toBeCloseTo(1.0, 1); // Should be fair
    });

    it('should monitor fairness metrics in dashboard', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/metrics')
        .set('Authorization', `Basic ${Buffer.from('admin:password').toString('base64')}`)
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('fairnessMetrics');
      expect(response.body.fairnessMetrics).toHaveProperty('fairnessRatio');
      expect(response.body.fairnessMetrics).toHaveProperty('companyStats');
    });

    it('should handle fairness alerts when ratio is low', async () => {
      // Arrange
      const unfairStats = {
        'company-1': { processed: 100, total: 1000 },
        'company-2': { processed: 200, total: 500 },
        'company-3': { processed: 50, total: 2000 },
      };

      // Act
      const response = await request(app.getHttpServer())
        .post('/dashboard/fairness/alert')
        .set('Authorization', `Basic ${Buffer.from('admin:password').toString('base64')}`)
        .send({ companyStats: unfairStats })
        .expect(200);

      // Assert
      expect(response.body.alert).toBeDefined();
      expect(response.body.fairnessRatio).toBeLessThan(0.5);
    });
  });

  describe('Performance Integration', () => {
    let validAuthHeader: string;

    beforeEach(() => {
      const validCredentials = Buffer.from('admin:password').toString('base64');
      validAuthHeader = `Basic ${validCredentials}`;
    });

    it('should maintain performance with cursor pagination under load', async () => {
      // Arrange
      const concurrentRequests = 10;
      const startTime = Date.now();

      // Act
      const promises = Array(concurrentRequests).fill(null).map(() =>
        request(app.getHttpServer())
          .get('/dashboard/emails')
          .set('Authorization', validAuthHeader)
          .query({ limit: 50 })
      );

      const responses = await Promise.all(promises);

      // Assert
      const totalTime = Date.now() - startTime;
      const avgTimePerRequest = totalTime / concurrentRequests;
      
      expect(avgTimePerRequest).toBeLessThan(200); // Average < 200ms per request
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it('should handle large cursor pagination requests efficiently', async () => {
      // Arrange
      const startTime = Date.now();

      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/emails')
        .set('Authorization', validAuthHeader)
        .query({ limit: 1000 })
        .expect(200);

      // Assert
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(2000); // Should handle 1000 items in < 2s
      expect(response.body.data).toBeDefined();
    });

    it('should maintain fairness performance with many companies', async () => {
      // Arrange
      const companies = Array(20).fill(null).map((_, i) => `company-${i}`);
      const jobs = companies.map((companyId, index) => ({
        id: `job-${index}`,
        companyId,
      }));

      const startTime = Date.now();

      // Act
      const response = await request(app.getHttpServer())
        .post('/dashboard/jobs/process-fairness')
        .set('Authorization', `Basic ${Buffer.from('admin:password').toString('base64')}`)
        .send({ jobs, companies })
        .expect(200);

      // Assert
      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(500); // Should process 20 companies in < 500ms
      expect(response.body.processedJobs).toBeDefined();
    });
  });

  describe('Error Handling Integration', () => {
    let validAuthHeader: string;

    beforeEach(() => {
      const validCredentials = Buffer.from('admin:password').toString('base64');
      validAuthHeader = `Basic ${validCredentials}`;
    });

    it('should handle database errors gracefully in cursor pagination', async () => {
      // Arrange - Simulate database error by using invalid cursor
      const invalidCursor = Buffer.from('invalid-json').toString('base64');

      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/emails')
        .set('Authorization', validAuthHeader)
        .query({ 
          limit: 10,
          cursor: invalidCursor
        })
        .expect(400);

      // Assert
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Invalid cursor');
    });

    it('should handle fairness calculation errors gracefully', async () => {
      // Arrange
      const invalidStats = {
        'company-1': { processed: 'invalid', total: 1000 }, // Invalid processed value
      };

      // Act
      const response = await request(app.getHttpServer())
        .post('/dashboard/fairness/calculate')
        .set('Authorization', `Basic ${Buffer.from('admin:password').toString('base64')}`)
        .send({ companyStats: invalidStats })
        .expect(400);

      // Assert
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('Invalid company stats');
    });

    it('should handle missing company data gracefully', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/emails')
        .set('Authorization', validAuthHeader)
        .query({ 
          limit: 10,
          companyId: 'non-existent-company'
        })
        .expect(200);

      // Assert
      expect(response.body.data).toEqual([]);
      expect(response.body.hasMore).toBe(false);
    });
  });

  describe('MVP Scope Validation Integration', () => {
    let validAuthHeader: string;

    beforeEach(() => {
      const validCredentials = Buffer.from('admin:password').toString('base64');
      validAuthHeader = `Basic ${validCredentials}`;
    });

    it('should confirm cursor pagination is available in MVP', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/features')
        .set('Authorization', validAuthHeader)
        .expect(200);

      // Assert
      expect(response.body.features).toHaveProperty('cursorPagination', true);
      expect(response.body.features).toHaveProperty('companyPartitioning', true);
      expect(response.body.features).toHaveProperty('fairnessRoundRobin', true);
    });

    it('should confirm advanced features are not available in MVP', async () => {
      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/features')
        .set('Authorization', validAuthHeader)
        .expect(200);

      // Assert
      expect(response.body.features).toHaveProperty('advancedPartitioning', false);
      expect(response.body.features).toHaveProperty('dynamicFairness', false);
      expect(response.body.features).toHaveProperty('multiRegionSupport', false);
    });

    it('should validate MVP performance requirements are met', async () => {
      // Arrange
      const startTime = Date.now();

      // Act
      const response = await request(app.getHttpServer())
        .get('/dashboard/emails')
        .set('Authorization', validAuthHeader)
        .query({ limit: 100 })
        .expect(200);

      // Assert
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // MVP requirement: < 1s
      expect(response.body.data).toBeDefined();
    });
  });
});
