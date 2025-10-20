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
    this.config = {
      targetSuccessRatePct: parseFloat(process.env.SLO_TARGET_SUCCESS_RATE_PCT || '95'),
      maxErrorRatePct: parseFloat(process.env.SLO_MAX_ERROR_RATE_PCT || '5'),
      maxQueueAgeP95Ms: parseInt(process.env.SLO_MAX_QUEUE_AGE_P95_MS || '120000', 10),
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
  }
}


