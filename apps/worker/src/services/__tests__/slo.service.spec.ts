import { SLOService } from '../../services/slo.service';

// Mock MetricsService básico
const metrics = {
  getErrorRate: jest.fn(),
  getQueueAgeP95: jest.fn(),
} as any;

describe('SLOService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('deve estar dentro do SLO quando métricas estão abaixo dos limites', async () => {
    metrics.getErrorRate.mockResolvedValue(2.5);
    metrics.getQueueAgeP95.mockResolvedValue(50000);

    const slo = new SLOService(metrics, {
      maxErrorRatePct: 5,
      maxQueueAgeP95Ms: 120000,
    });

    const result = await slo.evaluate();
    expect(result.withinSLO).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('deve detectar violações quando acima dos limites', async () => {
    metrics.getErrorRate.mockResolvedValue(6.1);
    metrics.getQueueAgeP95.mockResolvedValue(180000);

    const slo = new SLOService(metrics, {
      maxErrorRatePct: 5,
      maxQueueAgeP95Ms: 120000,
    });

    const result = await slo.evaluate();
    expect(result.withinSLO).toBe(false);
    expect(result.violations.join(' ')).toContain('errorRate');
    expect(result.violations.join(' ')).toContain('queueAgeP95');
  });
});


