import { MetricsService } from './metrics.service';

interface SLOConfig {
  targetSuccessRatePct: number; // ex: 95
  maxErrorRatePct: number;      // ex: 5
  maxQueueAgeP95Ms: number;     // ex: 120000 (120s)
}

export class SLOService {
  private readonly config: SLOConfig;
  private readonly metrics: MetricsService;

  constructor(metricsService: MetricsService, config?: Partial<SLOConfig>) {
    this.metrics = metricsService;

    const targetSuccessRatePct = parseFloat(process.env.SLO_TARGET_SUCCESS_RATE_PCT || '95');
    const maxErrorRatePct = parseFloat(process.env.SLO_MAX_ERROR_RATE_PCT || '5');
    const maxQueueAgeP95Ms = parseInt(process.env.SLO_MAX_QUEUE_AGE_P95_MS || '120000', 10);

    if (Number.isNaN(targetSuccessRatePct) || targetSuccessRatePct < 0 || targetSuccessRatePct > 100) {
      throw new Error(`Invalid SLO_TARGET_SUCCESS_RATE_PCT: ${targetSuccessRatePct}. Must be 0-100.`);
    }
    if (Number.isNaN(maxErrorRatePct) || maxErrorRatePct < 0 || maxErrorRatePct > 100) {
      throw new Error(`Invalid SLO_MAX_ERROR_RATE_PCT: ${maxErrorRatePct}. Must be 0-100.`);
    }
    if (Number.isNaN(maxQueueAgeP95Ms) || maxQueueAgeP95Ms < 0) {
      throw new Error(`Invalid SLO_MAX_QUEUE_AGE_P95_MS: ${maxQueueAgeP95Ms}. Must be >= 0.`);
    }

    this.config = {
      targetSuccessRatePct,
      maxErrorRatePct,
      maxQueueAgeP95Ms,
      ...config,
    } as SLOConfig;
  }

  async evaluate(): Promise<{
    withinSLO: boolean;
    violations: string[];
    summary: {
      errorRatePct: number;
      queueAgeP95Ms: number;
    };
  }> {
    try {
      const [errorRate, queueAgeP95] = await Promise.all([
        this.metrics.getErrorRate(),
        this.metrics.getQueueAgeP95(),
      ]);

    const violations: string[] = [];

    if (errorRate > this.config.maxErrorRatePct) {
      violations.push(`errorRate ${errorRate.toFixed(2)}% > ${this.config.maxErrorRatePct}%`);
    }

    if (queueAgeP95 > this.config.maxQueueAgeP95Ms) {
      violations.push(`queueAgeP95 ${Math.round(queueAgeP95)}ms > ${this.config.maxQueueAgeP95Ms}ms`);
    }

      const withinSLO = violations.length === 0;

      return {
        withinSLO,
        violations,
        summary: {
          errorRatePct: Math.round(errorRate * 100) / 100,
          queueAgeP95Ms: Math.round(queueAgeP95),
        },
      };
    } catch (error) {
      console.error('[SLOService] Failed to evaluate metrics:', error);
      return {
        withinSLO: false,
        violations: ['metrics_unavailable'],
        summary: {
          errorRatePct: -1,
          queueAgeP95Ms: -1,
        },
      };
    }
  }
}


