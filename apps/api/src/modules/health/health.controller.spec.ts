import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { QueueService } from '../queue/queue.service';
import { HttpStatus } from '@nestjs/common';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: any;
  let queueService: any;

  beforeEach(() => {
    healthService = {
      performReadinessChecks: jest.fn(),
    };

    queueService = {
      getQueueHealth: jest.fn().mockResolvedValue({
        waiting: 1,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        total: 1,
      }),
    };

    controller = new HealthController(queueService, healthService);
  });

  describe('getHealthz', () => {
    it('deve retornar status ok com informações básicas', async () => {
      const result = await controller.getHealthz();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeDefined();
      expect(result.version).toBeDefined();
    });

    it('deve lançar exceção em caso de erro', async () => {
      // Mock para simular erro
      jest.spyOn(process, 'uptime').mockImplementation(() => {
        throw new Error('Test error');
      });

      await expect(controller.getHealthz()).rejects.toThrow();
    });
  });

  describe('getReadyz', () => {
    it('deve retornar status ready quando todas as verificações passam', async () => {
      const mockChecks = {
        database: { status: 'ok', message: 'Database connection successful' },
        redis: { status: 'ok', message: 'Redis connection successful' },
        ses: { status: 'ok', message: 'SES quota is healthy' },
      };

      healthService.performReadinessChecks.mockResolvedValue(mockChecks);

      const result = await controller.getReadyz();

      expect(result.status).toBe('ready');
      expect(result.checks).toEqual(mockChecks);
      expect(result.timestamp).toBeDefined();
    });

    it('deve lançar exceção quando alguma verificação falha', async () => {
      const mockChecks = {
        database: { status: 'ok', message: 'Database connection successful' },
        redis: { status: 'error', message: 'Redis connection failed' },
        ses: { status: 'ok', message: 'SES quota is healthy' },
      };

      healthService.performReadinessChecks.mockResolvedValue(mockChecks);

      await expect(controller.getReadyz()).rejects.toThrow();
    });

    it('deve lançar exceção quando healthService falha', async () => {
      healthService.performReadinessChecks.mockRejectedValue(new Error('Service error'));

      await expect(controller.getReadyz()).rejects.toThrow();
    });
  });

  describe('getHealth (deprecated)', () => {
    it('deve retornar status ok e métricas da fila', async () => {
      const result = await controller.getHealth();

      expect(result.status).toBe('ok');
      expect(result.queue.waiting).toBe(1);
      expect(result.queue.active).toBe(0);
      expect(result.queue.failed).toBe(0);
      expect(result.queue.delayed).toBe(0);
      expect(result.queue.total).toBe(1);
    });
  });
});


