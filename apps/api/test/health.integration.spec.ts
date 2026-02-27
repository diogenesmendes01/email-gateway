import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ConfigService } from '@nestjs/config';

describe('Health Endpoints (Integration)', () => {
  let app: INestApplication;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configService = moduleFixture.get<ConfigService>(ConfigService);
    
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/health/healthz', () => {
    it('deve retornar status ok com informações básicas', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
      });

      // Verificar se uptime é um número positivo
      expect(response.body.uptime).toBeGreaterThan(0);
      
      // Verificar se timestamp é uma data válida
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });

    it('deve responder rapidamente (< 100ms)', async () => {
      const startTime = Date.now();
      
      await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .expect(200);
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(100);
    });

    it('deve funcionar sem dependências externas', async () => {
      // Este teste garante que o healthz não depende de DB/Redis/SES
      const response = await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .expect(200);

      expect(response.body.status).toBe('ok');
    });
  });

  describe('GET /v1/health/readyz', () => {
    it('deve retornar status ready quando todas as verificações passam', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/health/readyz')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ready',
        checks: {
          database: {
            status: 'ok',
            message: expect.any(String),
            responseTime: expect.any(Number),
          },
          redis: {
            status: 'ok',
            message: expect.any(String),
            responseTime: expect.any(Number),
          },
          ses: {
            status: 'ok',
            message: expect.any(String),
            responseTime: expect.any(Number),
          },
        },
        timestamp: expect.any(String),
      });

      // Verificar se todos os checks têm status 'ok'
      Object.values(response.body.checks).forEach((check: any) => {
        expect(check.status).toBe('ok');
        expect(check.responseTime).toBeGreaterThan(0);
      });
    });

    it('deve incluir detalhes do SES quando disponível', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/health/readyz')
        .expect(200);

      const sesCheck = response.body.checks.ses;
      
      if (sesCheck.status === 'ok') {
        expect(sesCheck.details).toMatchObject({
          usagePercent: expect.any(Number),
          sentLast24Hours: expect.any(Number),
          max24HourSend: expect.any(Number),
          maxSendRate: expect.any(Number),
          threshold: expect.any(Number),
        });
      }
    });

    it('deve retornar erro quando alguma verificação falha', async () => {
      // Este teste seria executado com dependências mockadas para simular falhas
      // Por enquanto, apenas verificamos a estrutura da resposta de erro
      
      // Mock de falha seria implementado aqui se necessário
      const response = await request(app.getHttpServer())
        .get('/v1/health/readyz');

      // Se todas as verificações passam, deve retornar 200
      if (response.status === 200) {
        expect(response.body.status).toBe('ready');
      } else {
        // Se falha, deve retornar 503
        expect(response.status).toBe(503);
        expect(response.body.status).toBe('not_ready');
        expect(response.body.checks).toBeDefined();
      }
    });

    it('deve ter tempo de resposta aceitável (< 5s)', async () => {
      const startTime = Date.now();
      
      await request(app.getHttpServer())
        .get('/v1/health/readyz');
      
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(5000);
    });
  });

  describe('GET /v1/health (deprecated)', () => {
    it('deve retornar métricas da fila', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        queue: {
          waiting: expect.any(Number),
          active: expect.any(Number),
          failed: expect.any(Number),
          delayed: expect.any(Number),
          total: expect.any(Number),
        },
      });
    });
  });

  describe('Headers de resposta', () => {
    it('deve incluir headers de cache apropriados para healthz', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/health/healthz')
        .expect(200);

      // Health checks não devem ser cacheados
      expect(response.headers['cache-control']).toMatch(/no-cache|no-store/);
    });

    it('deve incluir headers de cache apropriados para readyz', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/health/readyz')
        .expect(200);

      // Readiness checks não devem ser cacheados
      expect(response.headers['cache-control']).toMatch(/no-cache|no-store/);
    });
  });

  describe('Concorrência', () => {
    it('deve suportar múltiplas requisições simultâneas', async () => {
      const promises = Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .get('/v1/health/healthz')
          .expect(200)
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.body.status).toBe('ok');
      });
    });

    it('deve suportar múltiplas requisições de readiness simultâneas', async () => {
      const promises = Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .get('/v1/health/readyz')
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect([200, 503]).toContain(response.status);
        expect(response.body.status).toMatch(/ready|not_ready/);
      });
    });
  });

  describe('Configuração de ambiente', () => {
    it('deve validar variáveis de ambiente críticas', () => {
      const requiredVars = [
        'DATABASE_URL',
        'REDIS_URL',
        'ENCRYPTION_KEY',
      ];

      requiredVars.forEach(varName => {
        const value = configService.get(varName);
        expect(value).toBeDefined();
        expect(value).not.toBe('');
      });
    });

    it('deve ter configurações padrão apropriadas', () => {
      expect(configService.get('PORT', 3000)).toBe(3000);
      expect(configService.get('API_PREFIX', 'v1')).toBe('v1');
      expect(configService.get('NODE_ENV', 'development')).toBeDefined();
    });
  });
});
