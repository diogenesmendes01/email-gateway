import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('deve retornar status ok e métricas da fila', async () => {
    const mockQueueService = {
      getQueueHealth: jest.fn().mockResolvedValue({ waiting: 1, active: 0, completed: 0, failed: 0, delayed: 0, total: 1 }),
    };

    const controller = new HealthController(mockQueueService as any);
    const res = await controller.getHealth();

    expect(res.status).toBe('ok');
    expect(res.queue.waiting).toBe(1);
  });
});


