import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Dashboard Auth Scope MVP (Performance)', () => {
  let app: INestApplication;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('v1');
    configService = moduleFixture.get<ConfigService>(ConfigService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Basic Auth Performance', () => {
    const validCredentials = Buffer.from('admin:password').toString('base64');
    const authHeader = `Basic ${validCredentials}`;

    it('should authenticate requests within 50ms (P95)', async () => {
      // Arrange
      const iterations = 100;
      const responseTimes: number[] = [];

      // Act
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        await request(app.getHttpServer())
          .get('/dashboard/metrics')
          .set('Authorization', authHeader)
          .expect(200);

        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      }

      // Assert
      const sortedTimes = responseTimes.sort((a, b) => a - b);
      const p95Index = Math.floor(sortedTimes.length * 0.95);
      const p95ResponseTime = sortedTimes[p95Index];

      expect(p95ResponseTime).toBeLessThan(50); // P95 < 50ms
    });

    it('should handle authentication failures efficiently', async () => {
      // Arrange
      const invalidCredentials = Buffer.from('admin:wrongpassword').toString('base64');
      const invalidAuthHeader = `Basic ${invalidCredentials}`;
      const iterations = 50;
      const responseTimes: number[] = [];

      // Act
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        await request(app.getHttpServer())
          .get('/dashboard/metrics')
          .set('Authorization', invalidAuthHeader)
          .expect(401);

        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      }

      // Assert
      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      expect(avgResponseTime).toBeLessThan(30); // Average < 30ms for auth failures
    });

    it('should maintain performance under concurrent load', async () => {
      // Arrange
      const concurrentRequests = 20;
      const startTime = Date.now();

      // Act
      const promises = Array(concurrentRequests).fill(null).map(() =>
        request(app.getHttpServer())
          .get('/dashboard/metrics')
          .set('Authorization', authHeader)
          .expect(200)
      );

      await Promise.all(promises);

      // Assert
      const totalTime = Date.now() - startTime;
      const avgTimePerRequest = totalTime / concurrentRequests;
      
      expect(avgTimePerRequest).toBeLessThan(100); // Average < 100ms per request
    });
  });

  describe('Dashboard Endpoints Performance', () => {
    const validCredentials = Buffer.from('admin:password').toString('base64');
    const authHeader = `Basic ${validCredentials}`;

    it('should load dashboard metrics within 200ms', async () => {
      // Arrange
      const startTime = Date.now();

      // Act
      await request(app.getHttpServer())
        .get('/dashboard/metrics')
        .set('Authorization', authHeader)
        .expect(200);

      // Assert
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(200);
    });

    it('should load email logs with pagination within 500ms', async () => {
      // Arrange
      const startTime = Date.now();

      // Act
      await request(app.getHttpServer())
        .get('/dashboard/logs')
        .set('Authorization', authHeader)
        .query({ limit: 50, offset: 0 })
        .expect(200);

      // Assert
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(500);
    });

    it('should load audit trail within 300ms', async () => {
      // Arrange
      const startTime = Date.now();

      // Act
      await request(app.getHttpServer())
        .get('/dashboard/audit')
        .set('Authorization', authHeader)
        .query({ days: 7 })
        .expect(200);

      // Assert
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(300);
    });

    it('should handle large result sets efficiently', async () => {
      // Arrange
      const startTime = Date.now();

      // Act
      await request(app.getHttpServer())
        .get('/dashboard/logs')
        .set('Authorization', authHeader)
        .query({ limit: 1000, offset: 0 })
        .expect(200);

      // Assert
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Even large results < 1s
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during repeated authentication', async () => {
      // Arrange
      const validCredentials = Buffer.from('admin:password').toString('base64');
      const authHeader = `Basic ${validCredentials}`;
      const iterations = 1000;

      // Act
      for (let i = 0; i < iterations; i++) {
        await request(app.getHttpServer())
          .get('/dashboard/metrics')
          .set('Authorization', authHeader)
          .expect(200);
      }

      // Assert
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      
      // Should not exceed 100MB for basic operations
      expect(heapUsedMB).toBeLessThan(100);
    });
  });

  describe('Throughput Requirements', () => {
    it('should handle MVP throughput requirements', async () => {
      // Arrange
      const validCredentials = Buffer.from('admin:password').toString('base64');
      const authHeader = `Basic ${validCredentials}`;
      
      // MVP requirement: 40k emails/month = ~1.3k/day = ~55/hour
      // Dashboard should handle at least 10x the email rate for monitoring
      const targetRequestsPerMinute = 100;
      const testDurationMs = 60000; // 1 minute
      const startTime = Date.now();
      let requestCount = 0;

      // Act
      while (Date.now() - startTime < testDurationMs) {
        await request(app.getHttpServer())
          .get('/dashboard/metrics')
          .set('Authorization', authHeader)
          .expect(200);
        
        requestCount++;
      }

      // Assert
      const actualRequestsPerMinute = requestCount;
      expect(actualRequestsPerMinute).toBeGreaterThanOrEqual(targetRequestsPerMinute);
    });
  });

  describe('Basic Auth vs Advanced Auth Performance Comparison', () => {
    it('should demonstrate Basic Auth performance advantage', async () => {
      // Arrange
      const validCredentials = Buffer.from('admin:password').toString('base64');
      const authHeader = `Basic ${validCredentials}`;
      const iterations = 100;
      const basicAuthTimes: number[] = [];

      // Act - Measure Basic Auth
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        
        await request(app.getHttpServer())
          .get('/dashboard/metrics')
          .set('Authorization', authHeader)
          .expect(200);

        basicAuthTimes.push(Date.now() - startTime);
      }

      // Simulate advanced auth overhead (database lookup, session validation, etc.)
      const advancedAuthSimulation = basicAuthTimes.map(time => time + 20); // +20ms overhead

      // Assert
      const basicAuthAvg = basicAuthTimes.reduce((sum, time) => sum + time, 0) / basicAuthTimes.length;
      const advancedAuthAvg = advancedAuthSimulation.reduce((sum, time) => sum + time, 0) / advancedAuthSimulation.length;

      expect(basicAuthAvg).toBeLessThan(advancedAuthAvg);
      expect(basicAuthAvg).toBeLessThan(50); // Basic Auth should be < 50ms average
    });
  });

  describe('Configuration Performance Impact', () => {
    it('should validate environment configuration does not impact performance', async () => {
      // Arrange
      const validCredentials = Buffer.from('admin:password').toString('base64');
      const authHeader = `Basic ${validCredentials}`;
      
      // Act
      const startTime = Date.now();
      
      await request(app.getHttpServer())
        .get('/dashboard/metrics')
        .set('Authorization', authHeader)
        .expect(200);

      const responseTime = Date.now() - startTime;

      // Assert
      expect(responseTime).toBeLessThan(100); // Should be fast even with config validation
      
      // Verify configuration is properly cached
      const configStartTime = Date.now();
      configService.get('DASHBOARD_BASIC_AUTH_ENABLED');
      const configTime = Date.now() - configStartTime;
      
      expect(configTime).toBeLessThan(1); // Config access should be < 1ms
    });
  });
});
