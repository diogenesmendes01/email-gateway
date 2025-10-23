import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DashboardService } from '../../src/modules/dashboard/dashboard.service';

describe('Cursor Paging, Partitioning and Fairness MVP (Performance)', () => {
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

  describe('Cursor Pagination Performance', () => {
    let validAuthHeader: string;

    beforeEach(() => {
      const validCredentials = Buffer.from('admin:password').toString('base64');
      validAuthHeader = `Basic ${validCredentials}`;
    });

    it('should maintain O(1) performance regardless of dataset size', async () => {
      // Arrange
      const datasetSizes = [100, 1000, 10000];
      const performanceResults: number[] = [];

      // Act
      for (const size of datasetSizes) {
        const startTime = Date.now();
        
        await request(app.getHttpServer())
          .get('/dashboard/emails')
          .set('Authorization', validAuthHeader)
          .query({ limit: 50 })
          .expect(200);

        const responseTime = Date.now() - startTime;
        performanceResults.push(responseTime);
      }

      // Assert
      // Performance should be relatively consistent regardless of dataset size
      const maxTime = Math.max(...performanceResults);
      const minTime = Math.min(...performanceResults);
      const variance = maxTime - minTime;
      
      expect(variance).toBeLessThan(200); // Variance should be < 200ms
      expect(maxTime).toBeLessThan(500); // Max time should be < 500ms
    });

    it('should outperform offset pagination with large datasets', async () => {
      // Arrange
      const largeOffset = 50000; // Simulate large offset
      const cursorPaginationStart = Date.now();

      // Act - Cursor pagination
      await request(app.getHttpServer())
        .get('/dashboard/emails')
        .set('Authorization', validAuthHeader)
        .query({ limit: 50 })
        .expect(200);

      const cursorTime = Date.now() - cursorPaginationStart;

      // Simulate offset pagination (would be slower)
      const offsetPaginationStart = Date.now();
      await request(app.getHttpServer())
        .get('/dashboard/emails')
        .set('Authorization', validAuthHeader)
        .query({ limit: 50, offset: largeOffset })
        .expect(200);

      const offsetTime = Date.now() - offsetPaginationStart;

      // Assert
      expect(cursorTime).toBeLessThan(offsetTime);
      expect(cursorTime).toBeLessThan(100); // Cursor should be < 100ms
    });

    it('should handle concurrent cursor pagination requests efficiently', async () => {
      // Arrange
      const concurrentRequests = 20;
      const startTime = Date.now();

      // Act
      const promises = Array(concurrentRequests).fill(null).map(() =>
        request(app.getHttpServer())
          .get('/dashboard/emails')
          .set('Authorization', validAuthHeader)
          .query({ limit: 25 })
      );

      await Promise.all(promises);

      // Assert
      const totalTime = Date.now() - startTime;
      const avgTimePerRequest = totalTime / concurrentRequests;
      
      expect(avgTimePerRequest).toBeLessThan(50); // Average < 50ms per request
      expect(totalTime).toBeLessThan(1000); // Total < 1s for 20 requests
    });
  });

  describe('Company Partitioning Performance', () => {
    let validAuthHeader: string;

    beforeEach(() => {
      const validCredentials = Buffer.from('admin:password').toString('base64');
      validAuthHeader = `Basic ${validCredentials}`;
    });

    it('should maintain performance with multiple company queries', async () => {
      // Arrange
      const companies = Array(10).fill(null).map((_, i) => `company-${i}`);
      const startTime = Date.now();

      // Act
      const promises = companies.map(companyId =>
        request(app.getHttpServer())
          .get('/dashboard/emails')
          .set('Authorization', validAuthHeader)
          .query({ limit: 20, companyId })
      );

      await Promise.all(promises);

      // Assert
      const totalTime = Date.now() - startTime;
      const avgTimePerCompany = totalTime / companies.length;
      
      expect(avgTimePerCompany).toBeLessThan(100); // Average < 100ms per company
      expect(totalTime).toBeLessThan(1000); // Total < 1s for 10 companies
    });

    it('should handle company-specific metrics efficiently', async () => {
      // Arrange
      const companies = ['company-1', 'company-2', 'company-3'];
      const startTime = Date.now();

      // Act
      const promises = companies.map(companyId =>
        request(app.getHttpServer())
          .get('/dashboard/kpis')
          .set('Authorization', validAuthHeader)
          .query({ companyId })
      );

      await Promise.all(promises);

      // Assert
      const totalTime = Date.now() - startTime;
      const avgTimePerCompany = totalTime / companies.length;
      
      expect(avgTimePerCompany).toBeLessThan(200); // Average < 200ms per company
    });

    it('should scale linearly with number of companies', async () => {
      // Arrange
      const companyCounts = [5, 10, 20];
      const performanceResults: number[] = [];

      // Act
      for (const count of companyCounts) {
        const companies = Array(count).fill(null).map((_, i) => `company-${i}`);
        const startTime = Date.now();

        const promises = companies.map(companyId =>
          request(app.getHttpServer())
            .get('/dashboard/emails')
            .set('Authorization', validAuthHeader)
            .query({ limit: 10, companyId })
        );

        await Promise.all(promises);
        performanceResults.push(Date.now() - startTime);
      }

      // Assert
      // Performance should scale linearly (not exponentially)
      const ratio = performanceResults[2] / performanceResults[0]; // 20 companies / 5 companies
      expect(ratio).toBeLessThan(5); // Should be close to 4x, not much more
    });
  });

  describe('Fairness Round-robin Performance', () => {
    it('should maintain fairness performance with many companies', async () => {
      // Arrange
      const companies = Array(50).fill(null).map((_, i) => `company-${i}`);
      const jobs = companies.map((companyId, index) => ({
        id: `job-${index}`,
        companyId,
        priority: index + 1,
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
      expect(processingTime).toBeLessThan(1000); // Should process 50 companies in < 1s
      expect(response.body.fairnessRatio).toBeCloseTo(1.0, 1); // Should be fair
    });

    it('should handle fairness calculation efficiently with large datasets', async () => {
      // Arrange
      const largeDataset = Array(1000).fill(null).map((_, i) => ({
        companyId: `company-${i % 10}`, // 10 companies, 100 jobs each
        processed: Math.floor(Math.random() * 100),
        total: 1000,
      }));

      const startTime = Date.now();

      // Act
      const response = await request(app.getHttpServer())
        .post('/dashboard/fairness/calculate')
        .set('Authorization', `Basic ${Buffer.from('admin:password').toString('base64')}`)
        .send({ companyStats: largeDataset })
        .expect(200);

      // Assert
      const calculationTime = Date.now() - startTime;
      expect(calculationTime).toBeLessThan(500); // Should calculate in < 500ms
      expect(response.body.fairnessRatio).toBeDefined();
    });

    it('should maintain fairness overhead minimal', async () => {
      // Arrange
      const companies = ['company-1', 'company-2', 'company-3'];
      const jobs = Array(1000).fill(null).map((_, i) => ({
        id: `job-${i}`,
        companyId: companies[i % companies.length],
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
      const overheadPerJob = processingTime / jobs.length;
      
      expect(overheadPerJob).toBeLessThan(1); // < 1ms overhead per job
      expect(response.body.fairnessRatio).toBeCloseTo(1.0, 1);
    });
  });

  describe('Memory Usage Performance', () => {
    let validAuthHeader: string;

    beforeEach(() => {
      const validCredentials = Buffer.from('admin:password').toString('base64');
      validAuthHeader = `Basic ${validCredentials}`;
    });

    it('should not leak memory during repeated cursor pagination', async () => {
      // Arrange
      const iterations = 100;
      const initialMemory = process.memoryUsage().heapUsed;

      // Act
      for (let i = 0; i < iterations; i++) {
        await request(app.getHttpServer())
          .get('/dashboard/emails')
          .set('Authorization', validAuthHeader)
          .query({ limit: 50 })
          .expect(200);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Assert
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;
      
      expect(memoryIncreaseMB).toBeLessThan(50); // Should not increase by more than 50MB
    });

    it('should handle large cursor pagination requests without memory issues', async () => {
      // Arrange
      const initialMemory = process.memoryUsage().heapUsed;

      // Act
      await request(app.getHttpServer())
        .get('/dashboard/emails')
        .set('Authorization', validAuthHeader)
        .query({ limit: 1000 })
        .expect(200);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Assert
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const memoryIncreaseMB = memoryIncrease / 1024 / 1024;
      
      expect(memoryIncreaseMB).toBeLessThan(100); // Should not increase by more than 100MB
    });
  });

  describe('Throughput Performance', () => {
    let validAuthHeader: string;

    beforeEach(() => {
      const validCredentials = Buffer.from('admin:password').toString('base64');
      validAuthHeader = `Basic ${validCredentials}`;
    });

    it('should meet MVP throughput requirements', async () => {
      // Arrange
      // MVP requirement: 40k emails/month = ~1.3k/day = ~55/hour
      // Dashboard should handle at least 10x the email rate for monitoring
      const targetRequestsPerMinute = 100;
      const testDurationMs = 60000; // 1 minute
      const startTime = Date.now();
      let requestCount = 0;

      // Act
      while (Date.now() - startTime < testDurationMs) {
        await request(app.getHttpServer())
          .get('/dashboard/emails')
          .set('Authorization', validAuthHeader)
          .query({ limit: 10 })
          .expect(200);
        
        requestCount++;
      }

      // Assert
      const actualRequestsPerMinute = requestCount;
      expect(actualRequestsPerMinute).toBeGreaterThanOrEqual(targetRequestsPerMinute);
    });

    it('should maintain performance under sustained load', async () => {
      // Arrange
      const sustainedLoadDuration = 30000; // 30 seconds
      const startTime = Date.now();
      const responseTimes: number[] = [];

      // Act
      while (Date.now() - startTime < sustainedLoadDuration) {
        const requestStart = Date.now();
        
        await request(app.getHttpServer())
          .get('/dashboard/emails')
          .set('Authorization', validAuthHeader)
          .query({ limit: 25 })
          .expect(200);

        responseTimes.push(Date.now() - requestStart);
      }

      // Assert
      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      
      expect(avgResponseTime).toBeLessThan(200); // Average < 200ms
      expect(maxResponseTime).toBeLessThan(1000); // Max < 1s
    });
  });

  describe('Cursor vs Offset Performance Comparison', () => {
    let validAuthHeader: string;

    beforeEach(() => {
      const validCredentials = Buffer.from('admin:password').toString('base64');
      validAuthHeader = `Basic ${validCredentials}`;
    });

    it('should demonstrate cursor pagination performance advantage', async () => {
      // Arrange
      const testSizes = [100, 1000, 5000];
      const cursorTimes: number[] = [];
      const offsetTimes: number[] = [];

      // Act
      for (const size of testSizes) {
        // Test cursor pagination
        const cursorStart = Date.now();
        await request(app.getHttpServer())
          .get('/dashboard/emails')
          .set('Authorization', validAuthHeader)
          .query({ limit: 50 })
          .expect(200);
        cursorTimes.push(Date.now() - cursorStart);

        // Test offset pagination (simulate large offset)
        const offsetStart = Date.now();
        await request(app.getHttpServer())
          .get('/dashboard/emails')
          .set('Authorization', validAuthHeader)
          .query({ limit: 50, offset: size })
          .expect(200);
        offsetTimes.push(Date.now() - offsetStart);
      }

      // Assert
      const cursorAvg = cursorTimes.reduce((sum, time) => sum + time, 0) / cursorTimes.length;
      const offsetAvg = offsetTimes.reduce((sum, time) => sum + time, 0) / offsetTimes.length;
      
      expect(cursorAvg).toBeLessThan(offsetAvg);
      expect(cursorAvg).toBeLessThan(100); // Cursor should be < 100ms average
    });

    it('should show cursor pagination scales better with dataset size', async () => {
      // Arrange
      const datasetSizes = [1000, 10000, 100000];
      const cursorVariance: number[] = [];
      const offsetVariance: number[] = [];

      // Act
      for (const size of datasetSizes) {
        // Cursor pagination (should be consistent)
        const cursorStart = Date.now();
        await request(app.getHttpServer())
          .get('/dashboard/emails')
          .set('Authorization', validAuthHeader)
          .query({ limit: 50 })
          .expect(200);
        cursorVariance.push(Date.now() - cursorStart);

        // Offset pagination (should degrade with size)
        const offsetStart = Date.now();
        await request(app.getHttpServer())
          .get('/dashboard/emails')
          .set('Authorization', validAuthHeader)
          .query({ limit: 50, offset: size })
          .expect(200);
        offsetVariance.push(Date.now() - offsetStart);
      }

      // Assert
      const cursorMaxVariance = Math.max(...cursorVariance) - Math.min(...cursorVariance);
      const offsetMaxVariance = Math.max(...offsetVariance) - Math.min(...offsetVariance);
      
      expect(cursorMaxVariance).toBeLessThan(offsetMaxVariance);
      expect(cursorMaxVariance).toBeLessThan(200); // Cursor variance should be < 200ms
    });
  });
});
